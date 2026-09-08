import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'Enter adds package paths with a fixed extension; Cancel and other dialogs keep their behavior',
  { timeout: 60000 },
  async (t) => {
    const base = 'http://127.0.0.1:5217',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5217', '--strictPort'],
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
    const page = await newAppPage(browser, { viewport: { width: 1400, height: 950 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    await page.locator('#add-file').click();
    assert.equal(await page.locator('#dialog-input').inputValue(), 'src/Helper');
    assert.equal(await page.locator('#dialog-suffix').textContent(), '.jal');
    const inputBox = await page.locator('#dialog-input').boundingBox(),
      suffixBox = await page.locator('#dialog-suffix').boundingBox();
    assert.ok(suffixBox.x >= inputBox.x + inputBox.width - 1);
    await page.locator('#dialog-input').fill('src/com.example.Helper');
    await page.screenshot({ path: '.cache/add-file.png' });
    await page.keyboard.press('Enter');
    await page.getByRole('tab', { name: 'Helper', exact: true }).waitFor();
    assert.equal(await page.locator('#dialog').isVisible(), false);
    assert.match(
      await page.evaluate(async () => (await import('/src/main.ts')).editor.getValue()),
      /public class com\/example\/Helper/,
    );
    await page.locator('#add-file').click();
    await page.locator('#dialog-input').fill('src/Another.jal');
    await page.locator('#dialog-ok').click();
    await page.getByRole('tab', { name: 'Another', exact: true }).waitFor();
    await page.locator('#add-file').click();
    await page.locator('#dialog-input').fill('src/Cancelled');
    await page.locator('#dialog-cancel').click();
    assert.equal(await page.getByRole('tab', { name: 'Cancelled', exact: true }).count(), 0);
    await page.locator('#add-file').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#dialog').isVisible(), false);
    await page.locator('#menu-file').click();
    await page.locator('#rename-file').click();
    assert.equal(await page.locator('#dialog-suffix').isVisible(), true);
    await page.locator('#dialog-input').fill('Renamed');
    await page.keyboard.press('Enter');
    await page.getByRole('tab', { name: 'Renamed', exact: true }).waitFor();
    for (const name of ['', '../Escape', 'src/com..Broken', 'src/com.example.Helper']) {
      await page.locator('#add-file').click();
      await page.locator('#dialog-input').fill(name);
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: '追加できませんでした' }).waitFor();
      await page.locator('#dialog-ok').click();
    }
    assert.equal(
      await page.locator('#file-list button[title="src/com/example/Helper.jal"]').count(),
      1,
    );
    assert.deepEqual(errors, []);
  },
);
