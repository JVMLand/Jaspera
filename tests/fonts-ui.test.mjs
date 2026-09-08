import test from 'node:test';
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { launchBrowser, newAppPage, detachAt } from './helpers/browser.mjs';

test(
  'downloaded code fonts render Japanese and Latin text in main and detached editors',
  { timeout: 60000 },
  async (t) => {
    const server = await preview({ preview: { host: '127.0.0.1', port: 5290, strictPort: true } });
    t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5290/jaspera/');
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    async function checkFonts(view) {
      await view.locator('.view-lines').first().waitFor();
      await view.evaluate(() => document.fonts.ready);
      const result = await view.evaluate(async () => {
        const loaded = await document.fonts.load('15px "UDEV Gothic"', 'Hello日本語');
        const code = document.querySelector('.view-lines');
        return {
          loaded: loaded.length,
          code: getComputedStyle(code).fontFamily,
          ui: getComputedStyle(document.body).fontFamily,
        };
      });
      assert.ok(result.loaded > 0);
      assert.match(result.code, /^"?UDEV Gothic/);
      assert.match(result.ui, /^"?Yu Gothic UI/);
      const client = await view.context().newCDPSession(view);
      await client.send('DOM.enable');
      await client.send('CSS.enable');
      const { root } = await client.send('DOM.getDocument');
      const { nodeId } = await client.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '.view-line > span > span',
      });
      const { fonts } = await client.send('CSS.getPlatformFontsForNode', { nodeId });
      assert.ok(
        fonts.some((font) => font.familyName === 'UDEV Gothic' && font.glyphCount > 0),
        JSON.stringify(fonts),
      );
      await client.detach();
    }
    await checkFonts(page);
    await page.screenshot({ path: '.cache/fonts-main.png' });
    const popupEvent = page.waitForEvent('popup');
    await detachAt(
      page,
      await page.getByRole('tab', { name: 'HelloWorld', exact: true }).boundingBox(),
    );
    const popup = await popupEvent;
    await checkFonts(popup);
    await popup.close();
    assert.deepEqual(errors, []);
  },
);
