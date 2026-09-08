import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchBrowser, newAppPage } from './helpers/browser.mjs';

test(
  'ignoring breakpoints preserves them, skips stops, and synchronizes detached controls',
  { timeout: 120000 },
  async (t) => {
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5294, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    page.setDefaultTimeout(60000);
    await page.goto('http://127.0.0.1:5294');
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    await page.locator('.feature-guide-skip:visible').click();
    const toggle = page.locator('#debug-ignore-breakpoints');
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    await page.locator('#menu-debug').click();
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    const pointCount = await page.locator('.debug-breakpoint').count();
    assert.ok(pointCount > 0);
    await page.locator('.monaco-editor.debug-breakpoints-ignored').waitFor();
    await page.locator('#run').click();
    await page.waitForFunction(() =>
      document.querySelector('#output')?.textContent.includes('JAL'),
    );
    await page.waitForFunction(() => document.querySelector('.debug-toolbar')?.hidden);
    assert.equal(await page.locator('.debug-breakpoint').count(), pointCount);
    // Turning the option off restores the existing HelloWorld breakpoint.
    await page.locator('#menu-debug').click();
    await toggle.click();
    await page.locator('#run').click();
    await page.locator('.debug-toolbar[data-state=paused]').waitFor();
    const event = page.waitForEvent('popup');
    await page.locator('#debug-tab').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
    const popup = await event;
    await popup.locator('.debug-toolbar[data-state=paused]').waitFor();
    await popup.locator('[data-command=debug-ignore-breakpoints]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#debug-ignore-breakpoints')?.getAttribute('aria-checked') ===
        'true',
    );
    assert.equal(
      await popup.locator('[data-command=debug-ignore-breakpoints]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('.debug-breakpoint').count(), pointCount);
    await popup.locator('[data-command=debug-over]').click();
    await popup.locator('.debug-toolbar[data-state=paused]').waitFor();
    await popup.locator('[data-command=debug-continue]').click();
    await popup.waitForFunction(() => document.querySelector('.debug-toolbar')?.hidden);
    await popup.close();
  },
);
