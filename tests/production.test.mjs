import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';
test(
  'Production static build works under a subdirectory and on mobile',
  { timeout: 90000 },
  async (t) => {
    const root = resolve('dist');
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.wasm': 'application/wasm',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
    };
    const server = createServer(async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!pathname.startsWith('/playground/')) {
        res.writeHead(404).end();
        return;
      }
      const path = resolve(root, pathname.slice('/playground/'.length) || 'index.html');
      if (!path.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      try {
        const bytes = await readFile(path);
        res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' });
        res.end(bytes);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const browser = await chromium.launch({
      channel: process.env.JALWEB_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
      headless: true,
    });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/playground/`);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      {},
      { timeout: 60000 },
    );
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行が完了しました',
      {},
      { timeout: 30000 },
    );
    assert.equal(await page.locator('#output').textContent(), 'Hello, World!\n');
    const owner = page
      .locator('#editor .view-lines')
      .getByText('java/lang/System', { exact: true })
      .first();
    await page.keyboard.down('Control');
    await owner.hover();
    await page.locator('.goto-definition-link').first().waitFor({ timeout: 45000 });
    await owner.click();
    await page.keyboard.up('Control');
    await page.waitForFunction(
      () =>
        document.querySelector('#file-tabs [aria-selected=true]')?.textContent ===
        'java/lang/System.class (JAL)',
    );
    await page
      .getByRole('button', { name: 'java/lang/System.class (JAL) のタブを閉じる', exact: true })
      .click();

    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('#run').isVisible());
    assert.ok(await page.locator('#output').isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: 'test-results/mobile.png' });
    await page.locator('#menu-view').click();
    await page.locator('#theme-settings').click();
    for (const [id, bg] of [
      ['darcula', 'rgb(43, 43, 43)'],
      ['vs', 'rgb(255, 255, 255)'],
      ['vs-dark', 'rgb(30, 30, 30)'],
      ['hc-black', 'rgb(0, 0, 0)'],
      ['hc-light', 'rgb(255, 255, 255)'],
    ]) {
      await page.locator('#theme-select').selectOption(id);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), id);
      assert.equal(
        await page
          .locator('.monaco-editor')
          .first()
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        id === 'vs' ? 'rgb(255, 255, 254)' : bg,
      );
      assert.equal(
        await page.locator('.source-pane').evaluate((e) => getComputedStyle(e).backgroundColor),
        bg,
      );
    }
    for (const [id, bg] of [
      ['japan-light', 'rgb(255, 255, 255)'],
      ['hitachi-light', 'rgb(255, 255, 255)'],
      ['hitachi-dark', 'rgb(21, 29, 36)'],
      ['denden-light', 'rgb(255, 255, 255)'],
      ['denden-night', 'rgb(12, 25, 45)'],
    ]) {
      await page.locator('#theme-select').selectOption(id);
      assert.equal(
        await page
          .locator('.monaco-editor')
          .first()
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        bg,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.style.colorScheme),
        id.endsWith('light') ? 'light' : 'dark',
      );
      assert.equal(await page.evaluate(() => localStorage.getItem('jalweb.theme')), id);
      await page.locator('#theme-dialog button').click();
      await page.waitForTimeout(180);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `test-results/theme-${id}-mobile.png`, fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(180);
      const source = await page.locator('.source-pane').boundingBox(),
        output = await page.locator('.output-pane').boundingBox(),
        project = await page.locator('.project-pane').boundingBox();
      if (id.startsWith('hitachi'))
        assert.ok(output.y >= source.y + source.height, 'Hitachi terminal is below editor');
      if (id.startsWith('denden'))
        assert.ok(
          project.x < source.x && output.x > source.x,
          'DenDen uses left navigation and adjacent work panels',
        );
      if (id.startsWith('japan'))
        assert.ok(
          project.x < source.x && output.x > source.x,
          'Japan uses a tree and side-by-side work panels',
        );
      assert.ok(source.height >= 190 && source.width >= 300);
      assert.ok(output.y + output.height <= 900);
      assert.equal(await page.locator('#output').textContent(), 'Hello, World!\n');
      const owner = page
        .locator('#editor .view-lines')
        .getByText('java/lang/System', { exact: true })
        .first();
      await page.keyboard.down('Control');
      await owner.hover();
      await page.locator('.goto-definition-link').first().waitFor({ timeout: 45000 });
      await owner.click();
      await page.keyboard.up('Control');
      await page.waitForFunction(
        () =>
          document.querySelector('#file-tabs [aria-selected=true]')?.textContent ===
          'java/lang/System.class (JAL)',
      );
      await page
        .getByRole('button', { name: 'java/lang/System.class (JAL) のタブを閉じる', exact: true })
        .click();

      await page.screenshot({ path: `test-results/theme-${id}-desktop.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#menu-view').click();
      await page.locator('#theme-settings').click();
    }
    await page.locator('#theme-dialog button').click();
    await page.locator('#summary-properties').click();
    await page.locator('#project-properties').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#properties-name').inputValue(), 'Main');
    await page.locator('#properties-cancel').click();
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'denden-night');
    await page.locator('#menu-view').click();
    await page.locator('#theme-settings').click();
    await page.locator('#theme-select').selectOption('darcula');
    await page.locator('#theme-dialog button').click();
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'darcula');
    await page.screenshot({ path: 'test-results/theme-darcula-mobile.png' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#menu-view').click();
    await page.locator('#theme-settings').click();
    await page.locator('#theme-select').selectOption('vs');
    await page.locator('#theme-dialog button').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/theme-light-desktop.png' });
    assert.equal(
      await page.locator('#file-tabs [aria-selected=true]').textContent(),
      'src/Main.jal',
    );
    await page.locator('#menu-view').click();
    await page.locator('#theme-settings').click();
    await page.locator('#theme-select').selectOption('jal-night');
    await page.locator('#theme-dialog button').click();
    assert.equal(
      await page.locator('.source-pane').evaluate((e) => getComputedStyle(e).backgroundColor),
      'rgb(21, 26, 33)',
    );
    // The detached entry must also resolve when hosted below a path prefix.
    const tab = await page.getByRole('tab', { name: 'src/Main.jal', exact: true }).boundingBox();
    const pane = await page.locator('.source-pane').boundingBox();
    const popupEvent = page.waitForEvent('popup');
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(420);
    await page.mouse.move(pane.x + pane.width + 40, pane.y + 100, { steps: 8 });
    await page.mouse.up();
    const popup = await popupEvent;
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.waitForFunction(() => document.querySelector('#file-tabs [role=tab]') !== null);
    assert.match(popup.url(), /\/playground\/detached\.html/);
    assert.equal(
      await popup.locator('#file-tabs [aria-selected=true]').textContent(),
      'src/Main.jal',
    );
    await popup.locator('#editor > .monaco-editor').click();
    await popup.keyboard.press('Control+a');
    await popup.keyboard.insertText('public class Main { bad }');
    await popup.locator('.squiggly-error').first().waitFor({ timeout: 20000 });
    await popup.keyboard.press('Control+z');
    await popup.waitForFunction(() =>
      document
        .querySelector('.view-lines')
        ?.textContent.replace(/\u00a0/g, ' ')
        .includes('Hello, World!'),
    );

    await popup.close();
    await page.getByRole('tab', { name: 'src/Main.jal', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  },
);
