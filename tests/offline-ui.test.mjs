import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'prepared production build restarts, shows lazy panels and runs Java without network',
  { timeout: 180000 },
  async (t) => {
    const base = 'http://127.0.0.1:5230';
    const server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '5230',
        '--strictPort',
      ],
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
    const context = await browser.newContext(),
      page = await context.newPage();
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    assert.equal(
      requests.some((url) => url.includes('/instructions-panel-')),
      false,
    );
    await page.locator('#menu-help').click();
    await page.locator('#help-offline').click();
    await page.locator('.offline-start').click();
    await page.waitForFunction(() => !document.querySelector('.offline-start')?.disabled);
    assert.match(await page.locator('.offline-status').textContent(), /保存が完了しました/);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.locator('.offline-close').click();
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys())
          if (request.url.includes('elk-worker')) await cache.delete(request);
      }
    });
    await page.locator('#menu-help').click();
    await page.locator('#help-offline').click();
    await page.locator('.offline-start').click();
    await page.waitForFunction(() => !document.querySelector('.offline-start')?.disabled);
    assert.match(await page.locator('.offline-status').textContent(), /保存が完了しました/);
    await page.locator('.offline-close').click();
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await page.locator('#instructions-tab').click();
    await page.locator('.instruction-detail').waitFor();
    await page.locator('.instruction-usage').waitFor({ state: 'attached' });
    await page.locator('#graph-tab').click();
    await page.locator('.graph-node rect').first().waitFor();
    assert.equal(await page.locator('.graph-node').count(), 4);
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行が完了しました',
    );
    assert.equal(await page.locator('#output').textContent(), 'Hello, World!\n');
    await page.locator('#menu-help').click();
    await page.locator('#help-offline').click();
    await page.locator('.offline-start').click();
    await page.waitForFunction(() =>
      document.querySelector('.offline-status')?.textContent.includes('保存済みです'),
    );
    await page.locator('.offline-close').click();
    await page.locator('#instructions-tab').click();
    const popupEvent = page.waitForEvent('popup');
    await page.locator('#instructions-tab').click({ button: 'right' });
    await page.locator('.panel-context-menu').getByText('小窓で開く', { exact: true }).click();
    const popup = await popupEvent;
    await popup.locator('.instruction-usage').waitFor();
    await popup.close();
    assert.deepEqual(errors, []);
  },
);
