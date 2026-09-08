import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { preview } from 'vite';
import { launchBrowser, newAppPage } from './helpers/browser.mjs';

test(
  'license viewer serves original texts under the deployment base and retries failures',
  { timeout: 120000 },
  async (t) => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 5274, strictPort: true } });
    t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser, { locale: 'en-US' });
    await page.goto('http://127.0.0.1:5274/jaspera/');
    await page.locator('#menu-help').click();
    await page.locator('#help-licenses').click();
    const dialog = page.locator('#licenses-dialog');
    const body = dialog.locator('pre');
    assert.equal(await dialog.locator('h2').textContent(), 'Open-source licenses');
    assert.equal(
      (await body.textContent()).replaceAll('\r\n', '\n'),
      (await readFile('THIRD_PARTY_NOTICES.md', 'utf8')).replaceAll('\r\n', '\n'),
    );
    const buttons = dialog.locator('nav button');
    assert.equal(await buttons.count(), 17);
    for (let i = 1; i < 17; i++) {
      const button = buttons.nth(i);
      const name = await button.textContent();
      await button.click();
      const expected = (await readFile(`public/licenses/${name}.txt`, 'utf8')).replaceAll(
        '\r\n',
        '\n',
      );
      await page.waitForFunction(
        (expected) =>
          document.querySelector('#licenses-dialog pre')?.textContent.replaceAll('\r\n', '\n') ===
          expected,
        expected,
      );
      assert.equal(await body.getAttribute('translate'), 'no');
    }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.locator('#menu-help').click();
    await page.locator('#help-licenses').click();
    await page.route('**/licenses/Monaco.txt', (route) =>
      route.fulfill({ status: 503, body: 'unavailable' }),
    );
    await dialog.getByRole('button', { name: 'Monaco', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('#licenses-dialog pre')?.textContent ===
        'Could not load this license. Select it again to retry.',
    );
    await page.unroute('**/licenses/Monaco.txt');
    await dialog.getByRole('button', { name: 'Monaco', exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector('#licenses-dialog pre')
        ?.textContent.includes('Permission is hereby granted'),
    );
    await page.setViewportSize({ width: 390, height: 700 });
    assert.ok(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth));
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
  },
);
