import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'String renders all 170 methods beyond the old 2000-instruction class limit',
  { timeout: 240000 },
  async (t) => {
    const base = 'http://127.0.0.1:5238',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5238', '--strictPort'],
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
    const page = await newAppPage(browser, { viewport: { width: 1500, height: 1000 } });
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    const entry = 'java/lang/String.class',
      bytes = unzipSync(await readFile('public/runtime/jdk23.jar'), {
        filter: (f) => f.name === entry,
      })[entry];
    const started = performance.now();
    await page.evaluate((bytes) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], 'String.class'));
      window.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
      );
    }, Array.from(bytes));
    await page.waitForFunction(() =>
      document.querySelector('#state')?.textContent.includes('逆アセンブルしました'),
    );
    await page.locator('#graph-tab').click();
    await page.waitForFunction(() =>
      document.querySelector('.graph-status')?.textContent.includes(' · 100% · '),
    );
    assert.equal(await page.locator('.graph-method-group').count(), 170);
    await page.waitForFunction(() =>
      document.querySelector('.graph-method-group:first-child .graph-node'),
    );
    assert.match(await page.locator('.graph-status').innerText(), /170\/170/);
    const count = await page.locator('.graph-node').count();
    assert.ok(count < 5258);
    assert.doesNotMatch(await page.locator('.graph-status').innerText(), /上限|失敗/);
    console.log(
      'String full graph: ' +
        Math.round(performance.now() - started) +
        ' ms; ' +
        count +
        ' mounted nodes / 5258',
    );
    const canvas = page.locator('.graph-canvas'),
      rect = await canvas.boundingBox();
    const last = await page.locator('.graph-method-group').last().getAttribute('transform'),
      offset = Number(last.match(/translate\(0,([\d.]+)\)/)[1]);
    const transform = await page.locator('.graph-canvas>g').getAttribute('transform'),
      scale = Number(transform.match(/scale\(([\d.]+)\)/)[1]);
    await page.mouse.move(rect.x + 20, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + 20, rect.y + rect.height / 2 - offset * scale, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() =>
      document.querySelector('.graph-method-group:last-child .graph-node'),
    );
    assert.ok((await page.locator('.graph-node').count()) < 5258);
    assert.deepEqual(errors, []);
  },
);
