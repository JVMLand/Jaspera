import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'tool tabs dock independently, close and reopen with state, and swap sides',
  { timeout: 90000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5197', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5197';
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await chromium.launch({
      channel: process.env.JALWEB_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
      headless: true,
    });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1450, height: 950 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    await page.locator('#instructions-tab').click();
    await page.getByLabel('命令を検索').fill('iinc');
    async function drag(name, side) {
      const a = await page.locator('#' + name + '-tab').boundingBox(),
        b = await page.locator('.' + side + '-pane').boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(400);
      await page.mouse.move(b.x + b.width / 2, b.y + 120, { steps: 8 });
      await page.mouse.up();
    }
    await drag('instructions', 'source');
    assert.equal(await page.locator('.source-pane #instructions-panel').isVisible(), true);
    assert.equal(await page.locator('#editor').isVisible(), false);
    assert.equal(await page.locator('.output-pane #console-panel').isVisible(), true);
    assert.equal(await page.getByLabel('命令を検索').inputValue(), 'iinc');
    await page.getByRole('tab', { name: 'src/Main.jal', exact: true }).click();
    assert.equal(await page.locator('#editor').isVisible(), true);
    await page.locator('#instructions-tab').click();
    await page.getByRole('button', { name: 'Instructions のタブを閉じる', exact: true }).click();
    assert.equal(await page.locator('#editor').isVisible(), true);
    assert.equal(
      await page
        .getByRole('tab', { name: 'src/Main.jal', exact: true })
        .getAttribute('aria-selected'),
      'true',
    );
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Instructions', exact: true }).click();
    assert.equal(await page.getByLabel('命令を検索').inputValue(), 'iinc');
    await drag('instructions', 'output');
    assert.equal(await page.locator('.output-pane #instructions-panel').isVisible(), true);
    await page.locator('#console-tab').click();
    await page.locator('#stdin').fill('keep input');
    await drag('console', 'source');
    assert.equal(await page.locator('.source-pane #stdin').inputValue(), 'keep input');
    assert.equal(await page.locator('.source-pane #clear').isVisible(), true);
    assert.equal(await page.locator('.output-pane #problems-panel').isVisible(), true);
    await page.getByRole('tab', { name: 'src/Main.jal', exact: true }).click();
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: '左右のペインを入れ替える', exact: true }).click();
    const left = await page.locator('.output-pane').boundingBox(),
      right = await page.locator('.source-pane').boundingBox();
    assert.ok(left.x < right.x);
    const styles = await page
      .locator('.output-header .tabs')
      .evaluate((n) => ({
        y: getComputedStyle(n).overflowY,
        bar: getComputedStyle(n).scrollbarWidth,
      }));
    assert.deepEqual(styles, { y: 'hidden', bar: 'none' });
    await page.screenshot({ path: '.cache/panel-dock.png' });
    assert.deepEqual(errors, []);
    const live = await browser.newPage();
    await live.goto(base);
    await live.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    await live.locator('#console-tab').click({ button: 'right' });
    await live.getByRole('menuitem', { name: '左側へ移動', exact: true }).click();
    await live.getByRole('button', { name: 'Console のタブを閉じる', exact: true }).click();
    await live.locator('#run').click();
    await live.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行が完了しました',
      null,
      { timeout: 30000 },
    );
    assert.equal(await live.locator('.source-pane #console-panel').isVisible(), true);
    assert.equal(await live.locator('#output').textContent(), 'Hello, World!\n');
    await live.close();
  },
);
