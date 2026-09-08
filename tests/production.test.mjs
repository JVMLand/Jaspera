import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { launchBrowser, newAppContext, newAppPage, runHello } from './helpers/browser.mjs';
test(
  'Production static build works at the domain root and on mobile',
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
    const runtimeRequests = [];
    const server = createServer(async (req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.includes('/runtime/'))
        runtimeRequests.push(new URL(req.url, 'http://localhost').href);
      const path = resolve(root, pathname.slice(1) || 'index.html');
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
    const browser = await launchBrowser({
      headless: true,
    });
    t.after(() => browser.close());
    const page = await newAppPage(browser, {
      locale: 'en-US',
      viewport: { width: 1440, height: 900 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor({ timeout: 60000 });
    await page.waitForFunction(
      () =>
        document.documentElement.lang === 'en' &&
        document.querySelector('#state')?.textContent === 'Ready to run',
    );
    await runHello(page);
    assert.equal(await page.locator('#output').textContent(), 'Hello, JAL!\n');
    assert.ok(runtimeRequests.some((url) => new URL(url).pathname.endsWith('/modules.gzip')));
    assert.ok(!runtimeRequests.some((url) => new URL(url).pathname.endsWith('/modules')));
    await page.locator('#console-tab').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.locator('#run').isVisible());
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth,
      undefined,
      { timeout: 5000 },
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#menu-view').click();
    await page.locator('#theme-settings').click();
    await page.locator('#theme-select').selectOption('vs');
    await page.locator('#theme-dialog button').click();
    await page.reload();
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'vs');
    assert.match(
      await page
        .locator('.monaco-editor')
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      /255, 255, 25[45]/,
    );
    await page.locator('#instructions-tab').click();
    await page.locator('.instruction-detail').waitFor();
    const popupEvent = page.waitForEvent('popup');
    await page.locator('#instructions-tab').click({ button: 'right' });
    await page
      .locator('.panel-context-menu')
      .getByText('Open in detached window', { exact: true })
      .click();
    const popup = await popupEvent;
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.locator('.instruction-detail').waitFor();
    assert.match(popup.url(), /\/detached\.html/);
    await popup.close();
    await page.locator('#instructions-tab').waitFor();
    assert.deepEqual(errors, []);
  },
);
