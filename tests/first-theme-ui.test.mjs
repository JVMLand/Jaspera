import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'first visit opens theme picker with system preference and remembers the selection',
  { timeout: 90000 },
  async (t) => {
    const base = 'http://127.0.0.1:5229';
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5229', '--strictPort'],
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
    for (const [colorScheme, expected] of [
      ['dark', 'vs-dark'],
      ['light', 'vs'],
    ]) {
      const context = await newAppContext(browser, { colorScheme, theme: null });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base);
      const dialog = page.locator('#theme-dialog');
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await page.locator('#theme-select').inputValue(), expected);
      assert.equal(await page.locator('html').getAttribute('data-theme'), expected);
      await dialog.getByRole('button', { name: '閉じる' }).click();
      await page.reload();
      await page.locator('#theme-select option').first().waitFor({ state: 'attached' });
      assert.equal(await dialog.isVisible(), false);
      assert.equal(await page.locator('html').getAttribute('data-theme'), expected);
      await page.evaluate(async () => (await import('/src/themes.ts')).openThemePicker());
      await page.locator('#theme-select').selectOption('darcula');
      await dialog.getByRole('button', { name: '閉じる' }).click();
      await page.emulateMedia({ colorScheme: colorScheme === 'dark' ? 'light' : 'dark' });
      await page.reload();
      await page.locator('#theme-select option').first().waitFor({ state: 'attached' });
      assert.equal(await dialog.isVisible(), false);
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'darcula');
      assert.deepEqual(errors, []);
      await context.close();
    }
  },
);
