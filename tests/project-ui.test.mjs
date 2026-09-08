import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
test(
  'Folder project UI: real browser file handles, save, reopen and export',
  { timeout: 120000 },
  async (t) => {
    const base = 'http://127.0.0.1:5179';
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready);
    const browser = await chromium.launch({
      channel: process.env.JALWEB_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
      headless: true,
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Only the OS picker is substituted. Reads/writes use actual browser File System handles in OPFS.
    await page.addInitScript(() => {
      window.folderName = 'project-a';
      window.showDirectoryPicker = async () => {
        if (window.cancelPicker) throw new DOMException('Cancelled', 'AbortError');
        return (await navigator.storage.getDirectory()).getDirectoryHandle(window.folderName, {
          create: true,
        });
      };
    });
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state').textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    const menu = async (group, item) => {
      await page.locator('#menu-' + group).click();
      await page.locator('#' + item).click();
    };
    const saved = () =>
      page.waitForFunction(
        () => document.querySelector('#state').textContent === 'フォルダーに保存しました',
      );
    async function disk(path, write) {
      return page.evaluate(
        async ({ path, write }) => {
          let dir = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle(window.folderName);
          const parts = path.split('/'),
            name = parts.pop();
          for (const part of parts) dir = await dir.getDirectoryHandle(part);
          const h = await dir.getFileHandle(name);
          if (write !== undefined) {
            const w = await h.createWritable();
            await w.write(write);
            await w.close();
          }
          return (await h.getFile()).text();
        },
        { path, write },
      );
    }
    await t.test('first save creates settings-only jalprj and src/Main.jal', async () => {
      assert.equal(
        await page.locator('#file-tabs [aria-selected=true]').textContent(),
        'src/Main.jal',
      );
      await page.keyboard.press('ControlOrMeta+S');
      await saved();
      const config = JSON.parse(await disk('project.jalprj'));
      assert.equal(config.editor.version, 1);
      const { editor, ...properties } = config;
      assert.deepEqual(properties, {
        format: 'jalprj',
        version: 1,
        name: 'Main',
        entryFile: 'src/Main.jal',
      });
      assert.match(await disk('src/Main.jal'), /public class Main/);
    });
    await t.test('save overwrites the same source, reopen restores it and Run works', async () => {
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        editor.setValue(editor.getValue().replace('Hello, World!', 'フォルダーからこんにちは'));
      });
      await page.keyboard.press('ControlOrMeta+S');
      await saved();
      assert.match(await disk('src/Main.jal'), /フォルダーからこんにちは/);
      await menu('file', 'new-project');
      await page.waitForFunction(() => !document.querySelector('#output').textContent);
      await menu('file', 'open-project');
      await page.waitForFunction(
        () => document.querySelector('#state').textContent === '実行できます',
      );
      await page.locator('#run').click();
      await page.waitForFunction(
        () => document.querySelector('#state').textContent === '実行が完了しました',
        null,
        { timeout: 30000 },
      );
      assert.equal(await page.locator('#output').textContent(), 'フォルダーからこんにちは\n');
    });
    await t.test('add, rename and delete update disk on Save', async () => {
      await menu('file', 'new-file');
      assert.equal(await page.locator('#dialog-input').inputValue(), 'src/Helper.jal');
      await page.locator('#dialog-ok').click();
      await page.waitForFunction(
        () => document.querySelectorAll('#file-tabs [role=tab]').length === 2,
      );
      await page.keyboard.press('ControlOrMeta+S');
      await saved();
      assert.match(await disk('src/Helper.jal'), /public class Helper/);
      await menu('file', 'rename-file');
      await page.locator('#dialog-input').fill('src/util/Renamed.jal');
      await page.locator('#dialog-ok').click();
      await page.waitForFunction(
        () =>
          document.querySelector('#file-tabs [aria-selected=true]').textContent ===
          'src/util/Renamed.jal',
      );
      await page.keyboard.press('ControlOrMeta+S');
      await saved();
      assert.match(await disk('src/util/Renamed.jal'), /public class Helper/);
      await assert.rejects(() => disk('src/Helper.jal'));
      await menu('file', 'remove-file');
      await page.locator('#dialog-ok').click();
      await page.waitForFunction(
        () => document.querySelectorAll('#file-tabs [role=tab]').length === 1,
      );
      await page.keyboard.press('ControlOrMeta+S');
      await saved();
      await assert.rejects(() => disk('src/util/Renamed.jal'));
    });
    await t.test(
      'watcher reflects external additions, changes and removals without replacing other models',
      async () => {
        await page.evaluate(async () => {
          const root = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle(window.folderName);
          const src = await root.getDirectoryHandle('src');
          const h = await src.getFileHandle('Watched.jal', { create: true });
          const w = await h.createWritable();
          await w.write('public class Watched {}');
          await w.close();
        });
        await page.waitForFunction(
          () => document.querySelectorAll('#file-tabs [role=tab]').length === 2,
        );
        await disk('src/Main.jal', 'public class Main {\n}');
        await page.waitForFunction(async () => {
          const { editor } = await import('/src/main.ts');
          return editor.getValue() === 'public class Main {\n}';
        });
        assert.doesNotMatch(await page.locator('#project-name').textContent(), /•/);
        await page.evaluate(async () => {
          const root = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle(window.folderName);
          await (await root.getDirectoryHandle('src')).removeEntry('Watched.jal');
        });
        await page.waitForFunction(
          () => document.querySelectorAll('#file-tabs [role=tab]').length === 1,
        );
      },
    );
    await t.test('project properties follow external edits through the same watcher', async () => {
      const config = JSON.parse(await disk('project.jalprj'));
      config.name = 'External Project';
      delete config.entryFile;
      await disk('project.jalprj', JSON.stringify(config));
      await page.waitForFunction(
        () => document.querySelector('#project-name').textContent === 'External Project',
      );
      config.name = 'External Project 2';
      await disk('project.jalprj', JSON.stringify(config));
      await page.waitForFunction(
        () => document.querySelector('#project-name').textContent === 'External Project 2',
      );
    });
    await t.test(
      'external changes are preserved and unsaved state survives a failed save',
      async () => {
        await page.evaluate(async () => {
          const { editor } = await import('/src/main.ts');
          editor.setValue(editor.getValue() + '\n// unsaved');
        });
        await disk('src/Main.jal', 'external edit');
        await page.waitForFunction(() =>
          document.querySelector('#state').textContent.includes('競合'),
        );
        assert.match(
          await page.evaluate(async () => {
            const { editor } = await import('/src/main.ts');
            return editor.getValue();
          }),
          /unsaved/,
        );
        await page.keyboard.press('ControlOrMeta+S');
        await page.locator('#dialog').waitFor({ state: 'visible' });
        assert.match(await page.locator('#dialog-message').textContent(), /外部/);
        assert.equal(await disk('src/Main.jal'), 'external edit');
        assert.match(await page.locator('#project-name').textContent(), /•/);
        await page.locator('#dialog-ok').click();
      },
    );
    await t.test('Save As binds a new folder; picker cancel preserves work', async () => {
      await page.evaluate(() => (window.cancelPicker = true));
      await menu('file', 'save-project-as');
      assert.match(await page.locator('#project-name').textContent(), /•/);
      await page.evaluate(() => {
        window.cancelPicker = false;
        window.folderName = 'project-b';
      });
      await menu('file', 'save-project-as');
      await saved();
      assert.match(await disk('src/Main.jal'), /unsaved/);
    });
    await t.test(
      'ZIP export is a folder archive and properties persist without source duplication',
      async () => {
        await menu('file', 'project-properties-menu');
        await page.locator('#properties-name').fill('日本語プロジェクト');
        await page.locator('#properties-save').click();
        await page.keyboard.press('ControlOrMeta+S');
        await saved();
        assert.equal(JSON.parse(await disk('project.jalprj')).name, '日本語プロジェクト');
        const event = page.waitForEvent('download');
        await menu('file', 'export-project');
        const download = await event;
        assert.equal(download.suggestedFilename(), '日本語プロジェクト.zip');
        const zip = unzipSync(await readFile(await download.path()));
        assert.equal(JSON.parse(strFromU8(zip['project.jalprj'])).source, undefined);
        assert.match(strFromU8(zip['src/Main.jal']), /unsaved/);
      },
    );
    await t.test(
      'plain folder shares Open, reflects deletion of last source and saves without metadata',
      async () => {
        await page.evaluate(() => (window.folderName = 'plain-folder'));
        await menu('file', 'open-project');
        await page.waitForFunction(
          () => document.querySelectorAll('#file-tabs [role=tab]').length === 0,
        );
        await page.evaluate(async () => {
          const root = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle(window.folderName);
          const h = await root.getFileHandle('Main.jal', { create: true });
          const w = await h.createWritable();
          await w.write('public class Main {}');
          await w.close();
        });
        await page.waitForFunction(
          () =>
            document.querySelector('#file-tabs [aria-selected=true]')?.textContent === 'Main.jal',
        );
        await page.evaluate(async () => {
          const { editor } = await import('/src/main.ts');
          editor.setValue('public class Main {}\n// edited');
        });
        await page.keyboard.press('ControlOrMeta+S');
        await saved();
        assert.match(await disk('Main.jal'), /edited/);
        await assert.rejects(() => disk('project.jalprj'));
        await page.evaluate(async () => {
          const root = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle(window.folderName);
          await root.removeEntry('Main.jal');
        });
        await page.waitForFunction(
          () => document.querySelectorAll('#file-tabs [role=tab]').length === 0,
        );
      },
    );
    assert.deepEqual(errors, []);
  },
);
