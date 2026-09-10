import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';
import { launchBrowser, newAppPage } from './helpers/browser.mjs';

test(
  'ZIP sources run, edit and save to a newly chosen folder with Ctrl+S',
  { timeout: 120000 },
  async (t) => {
    const base = 'http://127.0.0.1:5297';
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5297', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    page.setDefaultTimeout(60000);
    await page.addInitScript(() => {
      window.pickerCalls = 0;
      window.showDirectoryPicker = async () => {
        window.pickerCalls++;
        if (window.cancelSave) throw new DOMException('Cancelled', 'AbortError');
        return (await navigator.storage.getDirectory()).getDirectoryHandle('zip-save', {
          create: true,
        });
      };
    });
    await page.goto(base);
    await page.evaluate(async () => {
      window.app = await import('/src/main.ts');
    });
    await page.waitForFunction(
      () => document.querySelector('#state').textContent === '実行できます',
    );
    const source = `public class Main {
    public static main([Ljava/lang/String;)V {
      getstatic java/lang/System->out:Ljava/io/PrintStream;
      invokestatic Helper->value()I
      invokevirtual java/io/PrintStream->println(I)V
      return
    }
  }`;
    const buffer = Buffer.from(
      zipSync({
        'answers/Main.jal': strToU8(source),
        'answers/Helper.jal': strToU8(
          'public class Helper { public static value()I { iconst_3 ireturn } }',
        ),
      }),
    );
    await page
      .locator('#file-input')
      .setInputFiles({ name: 'answers.ZIP', mimeType: 'application/zip', buffer });
    await page.waitForFunction(
      () =>
        window.app.editor.getModel()?.uri.path === '/Main.jal' &&
        !window.app.editor.getRawOptions().readOnly,
    );
    await page.waitForFunction(() => !document.querySelector('#run').disabled);
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.querySelector('#state').textContent === '実行が完了しました',
    );
    assert.equal((await page.locator('#output').textContent()).trim(), '3');
    await page.waitForFunction(() => !document.querySelector('#run').textContent.includes('Stop'));
    await page.evaluate(() => {
      window.app.editor
        .getModel()
        .setValue(window.app.editor.getModel().getValue() + '\n// edited');
      window.cancelSave = true;
    });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => window.pickerCalls === 1);
    await page.waitForFunction(() => !document.querySelector('#save-project').disabled);
    assert.ok(
      await page.evaluate(() => window.app.editor.getModel().getValue().includes('// edited')),
    );
    await page.evaluate(() => {
      window.cancelSave = false;
    });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(
      () => document.querySelector('#state').textContent === 'フォルダーに保存しました',
    );
    const disk = await page.evaluate(async () => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('zip-save');
      return {
        names: await Array.fromAsync(root.keys()),
        source: await (await (await root.getFileHandle('Main.jal')).getFile()).text(),
      };
    });
    assert.deepEqual(disk.names.sort(), ['Helper.jal', 'Main.jal']);
    assert.match(disk.source, /\/\/ edited/);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => !document.querySelector('#save-project').disabled);
    assert.equal(await page.evaluate(() => window.pickerCalls), 2);
  },
);
