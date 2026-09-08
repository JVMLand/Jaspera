import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, createTestProject, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'shared window commands protect modal input and edits during save or popup close',
  { timeout: 90000 },
  async (t) => {
    const base = 'http://127.0.0.1:5233',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5233', '--strictPort'],
        { stdio: 'pipe', windowsHide: true },
      );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await launchBrowser({ headless: true });
    t.after(() => browser.close());
    const context = await newAppContext(browser);
    await context.addInitScript(() => {
      localStorage.setItem('jalweb.theme', 'vs-dark');
      window.pickerCalls = 0;
      window.showDirectoryPicker = async () => {
        window.pickerCalls++;
        return (await navigator.storage.getDirectory()).getDirectoryHandle('safe-save', {
          create: true,
        });
      };
      const original = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = async function (...args) {
        const writer = await original.apply(this, args);
        if (this.name === 'Main.jal' && window.pauseWrites) {
          return {
            write: (data) => writer.write(data),
            abort: () => writer.abort(),
            close: async () => {
              window.writePending = true;
              await new Promise((resolve) => (window.resumeWrite = resolve));
              await writer.close();
            },
          };
        }
        return writer;
      };
    });
    const page = await context.newPage();
    await page.goto(base);
    await createTestProject(page);
    await page.locator('#editor .monaco-editor').waitFor();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    await page.keyboard.press('Shift');
    await page.keyboard.press('Shift');
    await page.getByRole('dialog', { name: 'どこでも検索' }).waitFor();
    await page.keyboard.press('Control+s');
    assert.equal(await page.evaluate(() => window.pickerCalls), 0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === 'フォルダーに保存しました',
    );
    const event = page.waitForEvent('popup');
    await page.locator('#instructions-tab').click({ button: 'right' });
    await page.locator('.panel-context-menu').getByText('小窓で開く', { exact: true }).click();
    const popup = await event;
    await popup.locator('#menus').waitFor();
    await popup.keyboard.press('Shift');
    await popup.keyboard.press('Shift');
    const search = popup.getByRole('dialog', { name: 'どこでも検索' });
    await search.getByRole('combobox').fill('Main.jal');
    await search.getByRole('option').filter({ hasText: 'Main.jal' }).first().click();
    await search.waitFor({ state: 'hidden' });
    const set = (source) =>
      popup.evaluate(async (source) => {
        const { editor } = await import('/src/detached.ts');
        editor.setValue(source);
        editor.focus();
      }, source);
    await set('public class Main { // first edit\n }');
    await page.evaluate(() => (window.pauseWrites = true));
    await popup.keyboard.press('Control+s');
    await page.waitForFunction(() => window.writePending);
    await set('public class Main { // second edit\n }');
    await page.evaluate(() => {
      window.pauseWrites = false;
      window.resumeWrite();
    });
    await page.waitForFunction(() =>
      document.querySelector('#state')?.textContent.includes('その後の変更は未保存'),
    );
    const disk = () =>
      page.evaluate(async () => {
        const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('safe-save'),
          src = await root.getDirectoryHandle('src');
        return (await (await src.getFileHandle('Main.jal')).getFile()).text();
      });
    assert.match(await disk(), /first edit/);
    await popup.close();
    await page.waitForFunction(async () => {
      const { editor } = await import('/src/main.ts');
      return editor.getValue().includes('second edit');
    });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === 'フォルダーに保存しました',
    );
    assert.match(await disk(), /second edit/);
    assert.equal(await page.evaluate(() => window.pickerCalls), 1);
  },
);
