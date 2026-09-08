import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test(
  'new visual families keep their layout, light editor colors and detached themes',
  { timeout: 120000 },
  async (t) => {
    const base = 'http://127.0.0.1:5208',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5208', '--strictPort'],
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } }),
      page = await context.newPage(),
      errors = [];
    context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    await page.locator('#menu-build').click();
    await page.locator('#menu-run').click();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行が完了しました',
      null,
      { timeout: 30000 },
    );
    assert.equal(await page.locator('#output').textContent(), 'Hello, World!\n');
    const themes = await page.evaluate(async () => (await import('/src/themes.ts')).themes);
    assert.equal(
      themes.some((t) => t.id.startsWith('ntt-') || t.label.includes('NTT')),
      false,
    );
    const ids = [
      'vibe-night',
      'vibe-light',
      'denden-night',
      'denden-light',
      'googol-night',
      'googol-light',
      'entrance-night',
      'entrance-light',
    ];
    for (const id of ids) assert.ok(themes.some((t) => t.id === id));
    await mkdir('.cache/brand-themes', { recursive: true });
    const shapes = [];
    const apply = (id) =>
      page.evaluate(async (id) => (await import('/src/themes.ts')).applyTheme(id), id);
    for (const id of ids) {
      await apply(id);
      await page.waitForTimeout(120);
      const before = await page
        .locator('#editor .lines-content')
        .evaluate((n) => getComputedStyle(n).backgroundColor);
      assert.equal(
        await page.evaluate(() => document.documentElement.style.colorScheme),
        id.endsWith('light') ? 'light' : 'dark',
      );
      assert.ok(await page.locator('.workspace-summary').isVisible());
      assert.equal(await page.getByRole('separator').count(), 2);
      const box = await page.locator('.source-pane').boundingBox();
      assert.ok(box.height > 300 && box.width > 300, id);
      shapes.push(
        await page.locator('.source-pane').evaluate((n) => getComputedStyle(n).borderRadius),
      );
      await page.screenshot({ path: '.cache/brand-themes/' + id + '.png' });
      await page.reload();
      await page.locator('.workspace [data-tab-key]').first().waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'), id);
      assert.equal(
        await page
          .locator('#editor .lines-content')
          .evaluate((n) => getComputedStyle(n).backgroundColor),
        before,
        id + ' reload',
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        id + ' overflow',
      );
      assert.ok(await page.getByRole('tab', { name: 'src/Main.jal', exact: true }).isVisible());
      await page.screenshot({ path: '.cache/brand-themes/' + id + '-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 960 });
    }
    assert.equal(new Set(shapes).size, 4, 'families have distinct card geometry');
    const popupEvent = page.waitForEvent('popup');
    await page.locator('#instructions-tab').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
    const popup = await popupEvent;
    await popup.getByRole('tab', { name: 'Instructions', exact: true }).waitFor();
    for (const id of ids) {
      await apply(id);
      await popup.waitForFunction((id) => document.documentElement.dataset.theme === id, id);
      assert.equal(await popup.locator('html').getAttribute('data-theme-family'), id.split('-')[0]);
      assert.ok(await popup.getByRole('tab', { name: 'Instructions', exact: true }).isVisible());
    }
    await popup.screenshot({ path: '.cache/brand-themes/detached.png' });
    await popup.close();
    await apply('darcula');
    assert.equal(await page.locator('html').getAttribute('data-theme-family'), null);
    assert.deepEqual(errors, []);
  },
);
