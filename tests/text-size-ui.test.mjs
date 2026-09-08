import test from 'node:test';
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { launchBrowser, newAppPage, detachAt } from './helpers/browser.mjs';

test(
  'editor and UI sizes are independent, persist, and synchronize with detached windows',
  { timeout: 60000 },
  async (t) => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 5291, strictPort: true } });
    t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5291/jaspera/');
    const tab = page.getByRole('tab', { name: 'HelloWorld', exact: true });
    await tab.waitFor();
    const fontSize = (view) =>
      view
        .locator('.view-lines')
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize);
    const uiSize = (view) =>
      view.locator('#menu-view').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const originalUi = await uiSize(page);
    const open = async (view) => {
      await view.locator('#menu-view').click();
      await view.locator('#text-size-settings').click();
    };
    await open(page);
    await page.locator('#text-size-editor').fill('24');
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.view-lines')).fontSize === '24px',
    );
    assert.equal(await uiSize(page), originalUi);
    await page.locator('#text-size-ui').fill('18');
    assert.ok(Math.abs((await uiSize(page)) / originalUi - 18 / 14) < 0.02);
    assert.equal(await fontSize(page), '24px');
    await page
      .locator('#text-size-dialog')
      .getByRole('button', { name: '閉じる', exact: true })
      .click();
    await page.reload();
    await tab.waitFor();
    assert.equal(await fontSize(page), '24px');
    const popupEvent = page.waitForEvent('popup');
    await detachAt(page, await tab.boundingBox());
    const popup = await popupEvent;
    await popup.locator('.view-lines').first().waitFor();
    assert.equal(await fontSize(popup), '24px');
    await open(popup);
    await popup.locator('#text-size-editor').fill('20');
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('jaspera.text-size')).editor === 20,
    );
    await popup
      .locator('#text-size-dialog')
      .getByRole('button', { name: '標準に戻す', exact: true })
      .click();
    await page.waitForFunction(
      () => document.documentElement.style.getPropertyValue('--ui-font-scale') === '1',
    );
    assert.equal(await fontSize(popup), '15px');
    assert.equal(await uiSize(page), originalUi);
    await popup.close();
    assert.deepEqual(errors, []);
  },
);
