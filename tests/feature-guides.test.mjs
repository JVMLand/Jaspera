import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'feature guides follow their targets and remember dismissal across windows',
  { timeout: 120000 },
  async (t) => {
    const base = 'http://127.0.0.1:5255';
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5255', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await launchBrowser({
      headless: true,
    });
    t.after(() => browser.close());
    const context = await newAppContext(browser, { viewport: { width: 1500, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    const guide = page.locator('.feature-guide');
    await guide.waitFor({ state: 'visible' });
    const first = await guide.getAttribute('data-guide');
    assert.ok(first);
    await guide.locator('.feature-guide-close').click();
    assert.equal(
      await page.evaluate((id) => localStorage.getItem('jaspera.guide.dismissed.' + id), first),
      '1',
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await guide.waitFor({ state: 'visible' });
    assert.notEqual(await guide.getAttribute('data-guide'), first);
    const breakpoint = page.locator('.jal-breakpoint-slot[data-guide="hello-breakpoint"]');
    assert.equal(await breakpoint.getAttribute('data-line'), '6');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-guide="hello-breakpoint"]')?.nextElementSibling
          ?.textContent === '5',
    );
    const gutter = await breakpoint.evaluate((node) => ({
      number: node.previousElementSibling.textContent,
      offset: node.nextElementSibling.textContent,
    }));
    assert.deepEqual(gutter, { number: '6', offset: '5' });
    await breakpoint.click();
    await page.waitForFunction(
      () =>
        document.querySelector('.feature-guide:not([hidden])')?.getAttribute('data-guide') ===
        'breakpoints',
    );
    await page.waitForTimeout(100);
    const anchor = await breakpoint.boundingBox(),
      tip = await page.locator('.feature-guide-arrow').boundingBox();
    assert.ok(Math.abs(tip.x + tip.width / 2 - (anchor.x + anchor.width / 2)) < 2);
    await guide.locator('.feature-guide-close').click();
    await page.locator('#instructions-tab').click();
    await page.waitForFunction(
      () =>
        document.querySelector('.feature-guide:not([hidden])')?.getAttribute('data-guide') ===
        'instructions',
    );
    const other = await page.context().newPage();
    await other.goto(base);
    await other.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await other.locator('#instructions-tab').click();
    await other.locator('.feature-guide[data-guide="instructions"]').waitFor({ state: 'visible' });
    await guide.locator('.feature-guide-close').click();
    await other.waitForFunction(
      () =>
        document.querySelector('.feature-guide:not([hidden])')?.getAttribute('data-guide') !==
        'instructions',
    );
    await other.close();
    await page.locator('#menu-help').click();
    await page.locator('#help-guides').click();
    await page.waitForFunction(
      () =>
        document.querySelector('.feature-guide:not([hidden])')?.getAttribute('data-guide') ===
        'instructions',
    );
    await page.setViewportSize({ width: 720, height: 700 });
    await page.waitForTimeout(150);
    const rect = await guide.boundingBox();
    assert.ok(
      rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 720 && rect.y + rect.height <= 700,
    );
    await page.screenshot({ path: '.cache/feature-guides-small.png' });
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: '.cache/feature-guides.png' });
    await page.locator('#menu-help').click();
    await page.locator('#help-manual').click();
    await guide.waitFor({ state: 'hidden' });
    await page.locator('#feature-manual .manual-close').click();
    const popupEvent = page.waitForEvent('popup');
    await page.locator('#instructions-tab').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
    const popup = await popupEvent;
    await popup.locator('.feature-guide[data-guide="instructions"]').waitFor({ state: 'visible' });
    await popup.locator('.feature-guide-close').click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem('jaspera.guide.dismissed.instructions')),
      '1',
    );
    await popup.close();
    await page.locator('#menu-help').click();
    await page.locator('#help-guides').click();
    await guide.waitFor({ state: 'visible' });
    await guide.locator('.feature-guide-skip').click();
    await guide.waitFor({ state: 'hidden' });
    const skipped = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('jaspera.guide.dismissed.'))
        .every((key) => localStorage.getItem(key) === '1'),
    );
    assert.ok(skipped);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await page.locator('#instructions-tab').click();
    await guide.waitFor({ state: 'hidden' });
    await page.locator('#menu-help').click();
    await page.locator('#help-guides').click();
    await guide.waitFor({ state: 'visible' });
  },
);
