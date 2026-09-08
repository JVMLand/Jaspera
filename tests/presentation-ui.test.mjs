import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchBrowser, newAppPage, detachAt } from './helpers/browser.mjs';

test(
  'presentation is temporary, restores geometry, and works without fullscreen',
  { timeout: 90000 },
  async (t) => {
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5292, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser, { viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('jaspera.text-size', JSON.stringify({ editor: 17, ui: 15 }));
    });
    await page.goto('http://127.0.0.1:5292');
    const tab = page.getByRole('tab', { name: 'HelloWorld', exact: true });
    await tab.waitFor();
    await page.locator('.feature-guide-skip:visible').click();
    const state = (view) =>
      view.evaluate(() => ({
        font: getComputedStyle(document.querySelector('.view-lines')).fontSize,
        scale: document.documentElement.style.getPropertyValue('--ui-font-scale'),
        saved: localStorage.getItem('jaspera.text-size'),
        groups: localStorage.getItem('jalweb.group-sizes'),
      }));
    const toggle = async (view) => {
      await view.locator('#menu-view').click();
      await view.locator('#presentation-mode').click();
    };
    const before = await state(page);
    const width = (await page.locator('.source-pane').boundingBox()).width;
    await toggle(page);
    await page.locator('html[data-presentation]').waitFor();
    await page.waitForFunction(() => !!document.fullscreenElement);
    assert.equal((await state(page)).font, '28px');
    assert.equal((await state(page)).saved, before.saved);
    assert.equal(await page.locator('.project-pane').isVisible(), false);
    assert.ok((await page.locator('.source-pane').boundingBox()).width > width);
    const output = await page.locator('.output-pane').boundingBox();
    assert.ok(output.x + output.width > 1400, 'presentation must fill the available width');
    const consoleFont = () =>
      page.locator('#output').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await page.waitForTimeout(100);
    const initialConsoleFont = await consoleFont();
    const splitter = page.locator('.separator-1');
    const handle = await splitter.boundingBox();
    const priorWidth = (await page.locator('.source-pane').boundingBox()).width;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x - 100, handle.y + handle.height / 2, { steps: 8 });
    await page.mouse.up();
    assert.ok((await page.locator('.source-pane').boundingBox()).width < priorWidth - 60);
    assert.equal(
      (await state(page)).groups,
      before.groups,
      'presentation resizing must not persist',
    );
    await page.screenshot({ path: '.cache/presentation.png' });
    await page.locator('#menu-view').click();
    await page.locator('#show-project').click();
    assert.equal(await page.locator('.project-pane').isVisible(), true);
    // Text-size edits during presentation do not overwrite the ordinary settings.
    await page.locator('#menu-view').click();
    await page.locator('#text-size-settings').click();
    await page.locator('#text-size-editor').fill('28');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('html[data-presentation]').count(), 1);
    assert.equal((await state(page)).font, '28px');
    await page.locator('#presentation-exit').click();
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(
      await page
        .locator('.dock-content')
        .first()
        .evaluate((el) => el.style.getPropertyValue('--ui-font-scale')),
      '',
    );
    assert.deepEqual(await state(page), before);
    assert.equal((await page.locator('.source-pane').boundingBox()).width, width);
    // Fullscreen denial still permits presentation, including Escape to exit.
    await page.evaluate(() => {
      document.documentElement.requestFullscreen = () =>
        Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    });
    await toggle(page);
    assert.equal((await state(page)).font, '28px');
    await page.keyboard.press('Escape');
    assert.deepEqual(await state(page), before);
    // Detached windows have their own presentation session and leave the main window alone.
    const event = page.waitForEvent('popup');
    await detachAt(page, await tab.boundingBox());
    const popup = await event;
    await popup.locator('.view-lines').first().waitFor();
    await toggle(popup);
    assert.equal((await state(popup)).font, '28px');
    assert.equal(await page.locator('html[data-presentation]').count(), 0);
    await popup.locator('#presentation-exit').click();
    assert.equal((await state(popup)).font, '17px');
    await popup.close();
    assert.deepEqual(errors, []);
  },
);
