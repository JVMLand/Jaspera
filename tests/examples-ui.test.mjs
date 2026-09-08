import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { chromium } from '@playwright/test';
test(
  'built-in examples run, remain editable and never enter project saves',
  { timeout: 180000 },
  async (t) => {
    const base = 'http://127.0.0.1:5215',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5215', '--strictPort'],
        { stdio: 'pipe', windowsHide: true },
      );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1450, height: 1000 } }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.showDirectoryPicker = async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('examples-test', {
          create: true,
        });
    });
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    const open = async (name) =>
      page.locator('#file-list button[title="example/' + name + '.jal"]').click();
    const expected = {
      HelloWorld: 'Hello, JAL!\n',
      Arithmetic: '36\n',
      Branches: 'greater than 10\n',
      Loop: '1\n2\n3\n4\n5\n',
      Arrays: '42\n3\n',
      Strings: 'Answer: 42\n',
      Collections: '[JAL, JVM]\n',
      Methods: '42\n',
      LongAndDouble: '20000000000\n3.5\n',
    };
    for (const [name, output] of Object.entries(expected)) {
      await open(name);
      assert.equal(
        await page.evaluate(
          async () => (await import('/src/main.ts')).editor.getRawOptions().readOnly,
        ),
        false,
      );
      await page.locator('#run').click();
      await page.waitForFunction(
        () =>
          ['実行が完了しました', '実行に失敗しました'].includes(
            document.querySelector('#state')?.textContent,
          ),
        null,
        { timeout: 30000 },
      );
      assert.equal(await page.locator('#output').textContent(), output, name);
    }
    await open('HelloWorld');
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue(editor.getValue().replace('Hello, JAL!', 'Edited sample'));
    });
    await page
      .getByRole('button', { name: 'example/HelloWorld.jal のタブを閉じる', exact: true })
      .click();
    await open('HelloWorld');
    assert.match(
      await page.evaluate(async () => (await import('/src/main.ts')).editor.getValue()),
      /Edited sample/,
    );
    const menu = async (id) => {
      await page.locator('#menu-file').click();
      await page.locator('#' + id).click();
    };
    let event = page.waitForEvent('download');
    await menu('save-class-source');
    let download = await event;
    assert.equal(download.suggestedFilename(), 'HelloWorld.jal');
    assert.match(await readFile(await download.path(), 'utf8'), /Edited sample/);
    await menu('save-project');
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === 'フォルダーに保存しました',
    );
    const disk = await page.evaluate(async () => {
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('examples-test');
      const files = [];
      async function visit(dir, prefix = '') {
        for await (const [name, entry] of dir.entries()) {
          if (entry.kind === 'directory') await visit(entry, prefix + name + '/');
          else files.push(prefix + name);
        }
      }
      await visit(root);
      return {
        files,
        properties: await (
          await root.getFileHandle('project.jalprj')
        )
          .getFile()
          .then((f) => f.text()),
      };
    });
    assert.deepEqual(disk.files.sort(), ['project.jalprj', 'src/Main.jal']);
    assert.doesNotMatch(disk.properties, /preview:example:|Edited sample/);
    event = page.waitForEvent('download');
    await menu('export-project');
    download = await event;
    const zip = unzipSync(await readFile(await download.path()));
    assert.deepEqual(Object.keys(zip).sort(), ['project.jalprj', 'src/Main.jal']);
    const tab = await page
        .getByRole('tab', { name: 'example/HelloWorld.jal', exact: true })
        .boundingBox(),
      popupEvent = page.waitForEvent('popup');
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(420);
    await page.mouse.move(1200, 15, { steps: 8 });
    await page.mouse.up();
    const popup = await popupEvent;
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.getByRole('tab', { name: 'example/HelloWorld.jal', exact: true }).waitFor();
    assert.equal(
      await popup.evaluate(
        async () => (await import('/src/detached.ts')).editor.getRawOptions().readOnly,
      ),
      false,
    );
    await popup.locator('#menu-build').click();
    await popup.locator('#menu-run').click();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行が完了しました',
    );
    assert.equal(await page.locator('#output').textContent(), 'Edited sample\n');
    await popup.close();
    await page.reload();
    await open('HelloWorld');
    assert.match(
      await page.evaluate(async () => (await import('/src/main.ts')).editor.getValue()),
      /Hello, JAL!/,
    );
    await menu('open-project');
    await page.locator('#file-list button[title="src/Main.jal"]').waitFor();
    assert.equal(await page.locator('#file-list button[title^="example/"]').count(), 9);
    assert.deepEqual(errors, []);
  },
);
