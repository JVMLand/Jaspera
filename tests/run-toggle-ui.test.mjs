import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'run control toggles stop during preparation and returns to run after completion',
  { timeout: 90000 },
  async (t) => {
    const base = 'http://127.0.0.1:5212',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5212', '--strictPort'],
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
    const page = await browser.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    const button = page.locator('#run');
    assert.equal(await button.getAttribute('aria-label'), '実行');
    assert.equal(await page.locator('#stop, #menu-stop').count(), 0);
    await button.click();
    assert.equal(await button.getAttribute('aria-label'), '停止');
    assert.equal(await button.isEnabled(), true);
    assert.match(await page.locator('#menu-run').textContent(), /^停止/);
    await button.click();
    assert.equal(await button.getAttribute('aria-label'), '実行');
    assert.equal(await page.locator('#state').textContent(), '停止しました');
    await button.click();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行が完了しました',
      null,
      { timeout: 30000 },
    );
    assert.equal(await button.getAttribute('aria-label'), '実行');
    assert.equal(await page.locator('#output').textContent(), 'Hello, World!\n');
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.focus();
    });
    await page.keyboard.press('Control+Enter');
    assert.equal(await button.getAttribute('aria-label'), '停止');
    await page.keyboard.press('Control+Enter');
    assert.equal(await button.getAttribute('aria-label'), '実行');
    assert.deepEqual(errors, []);
  },
);
