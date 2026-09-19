import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppPage, createTestProject } from './helpers/browser.ts';
test(
  'scratch drafts restore example edits and source edits, and report quota failures',
  { timeout: 90000 },
  async (t) => {
    const base = 'http://127.0.0.1:5248';
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5248', '--strictPort'],
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
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(base);
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    const set = (source) =>
      page.evaluate(async (source) => {
        const { editor } = await import('/src/main.ts');
        editor.setValue(source);
      }, source);
    const value = () => page.evaluate(async () => (await import('/src/main.ts')).editor.getValue());
    await set('// scratch example');
    // Reload before the debounce fires: beforeunload must flush synchronously.
    await page.reload();
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    assert.equal(await value(), '// scratch example');
    await createTestProject(page);
    await set('public class Main { // scratch source\n}');
    await page.reload();
    await page.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    assert.equal(await value(), 'public class Main { // scratch source\n}');
    await page.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'jaspera.draft.v1') throw new DOMException('Full', 'QuotaExceededError');
        return window.originalSetItem.call(this, key, value);
      };
    });
    await set('// quota failure');
    await page.getByText('下書きを保存できませんでした', { exact: true }).waitFor();
    assert.equal(await value(), '// quota failure');
    await page.locator('#dialog-ok').click();
    await page.evaluate(() => {
      Storage.prototype.setItem = window.originalSetItem;
    });
    await set('// recovered');
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('jaspera.draft.v1')!).project.files[0].source ===
        '// recovered',
    );
    await page.locator('#file-input').setInputFiles({
      name: 'Imported.jal',
      mimeType: 'text/plain',
      buffer: Buffer.from('public class Imported {}'),
    });
    await page.getByRole('tab', { name: 'Imported', exact: true }).waitFor();
    const before = await page.evaluate(() => localStorage.getItem('jaspera.draft.v1'));
    await set('// external edit');
    await page.reload();
    await page.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    assert.equal(await value(), '// recovered');
    assert.equal(await page.getByRole('tab', { name: 'Imported', exact: true }).count(), 0);
    assert.equal(JSON.parse(before!).project.files.length, 1);
  },
);
