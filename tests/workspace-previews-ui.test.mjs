import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'project restores class and library tabs from references, skipping missing files',
  { timeout: 120000 },
  async (t) => {
    const base = 'http://127.0.0.1:5205',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5205', '--strictPort'],
        { stdio: 'pipe', windowsHide: true },
      );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await chromium.launch({
      channel: process.platform === 'win32' ? 'msedge' : 'chromium',
      headless: true,
    });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1450, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state').textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    await page.evaluate(async () => {
      const { Runtime } = await import('/src/runtime.ts'),
        runtime = new Runtime();
      let code;
      try {
        code = (
          await runtime.compile(
            'public class Probe { public static answer()I { iconst_1 ireturn } }',
          )
        ).bytecode;
      } finally {
        runtime.stop();
      }
      const root = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle('preview-layout', { create: true });
      const write = async (dir, name, text) => {
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await w.write(text);
        await w.close();
      };
      await write(
        root,
        'Probe.class',
        Uint8Array.from(atob(code), (c) => c.charCodeAt(0)),
      );
      await write(
        await root.getDirectoryHandle('src', { create: true }),
        'Main.jal',
        'public class Main { public static main([Ljava/lang/String;)V { return } }',
      );
      const tabs = [
        { key: 'source:src/Main.jal', side: 'source' },
        { key: 'preview:folder:Probe.class', side: 'output' },
        { key: 'preview:definition:java/lang/System.class', side: 'source' },
        { key: 'preview:folder:Missing.class', side: 'source' },
      ];
      const editor = {
        version: 1,
        tabs,
        selected: { source: tabs[2].key, output: tabs[1].key },
        activeSide: 'source',
        collapsedFolders: [],
        dock: {
          order: {
            project: ['project'],
            source: [],
            output: ['console', 'problems', 'instructions'],
          },
          selected: { project: 'project', source: null, output: null },
          closed: [],
          sizes: [0.17, 0.48, 0.35],
          swapped: false,
        },
        windows: [],
        views: { [tabs[2].key]: { line: 5, column: 1, scrollTop: 0, scrollLeft: 0 } },
        wordWrap: false,
      };
      await write(
        root,
        'project.jalprj',
        JSON.stringify({
          format: 'jalprj',
          version: 1,
          name: 'Preview',
          entryFile: 'src/Main.jal',
          editor,
        }),
      );
      window.showDirectoryPicker = async () => root;
    });
    await page.locator('#menu-file').click();
    await page.locator('#open-project').click();
    await page
      .getByRole('tab', { name: 'java/lang/System.class (JAL)', exact: true })
      .waitFor({ timeout: 60000 });
    assert.equal(
      await page
        .locator('.output-pane')
        .getByRole('tab', { name: 'Probe.class (JAL)', exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page.getByRole('tab', { name: 'Missing.class (JAL)', exact: true }).count(),
      0,
    );
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.deepEqual(
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        return { readOnly: editor.getRawOptions().readOnly, line: editor.getPosition().lineNumber };
      }),
      { readOnly: true, line: 5 },
    );
    await page.keyboard.press('ControlOrMeta+S');
    await page.waitForFunction(
      () => document.querySelector('#state').textContent === 'フォルダーに保存しました',
    );
    const config = await page.evaluate(async () =>
      JSON.parse(
        await (
          await (
            await (await navigator.storage.getDirectory()).getDirectoryHandle('preview-layout')
          ).getFileHandle('project.jalprj')
        )
          .getFile()
          .then((f) => f.text()),
      ),
    );
    assert.equal(config.editor.tabs.length, 3);
    assert.equal(JSON.stringify(config).includes('public class'), false);
    assert.deepEqual(errors, []);
  },
);
