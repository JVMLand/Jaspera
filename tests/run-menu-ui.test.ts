import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchBrowser, newAppPage } from './helpers/browser.ts';

test(
  'run dropdown chooses debug or forced breakpoint bypass without changing the preference',
  { timeout: 120000 },
  async (t) => {
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5295, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser, { viewport: { width: 1440, height: 960 } });
    page.setDefaultTimeout(60000);
    await page.goto('http://127.0.0.1:5295');
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    await page.locator('.feature-guide-skip:visible').click();
    await page.waitForFunction(
      () => !(document.querySelector('#run-options') as HTMLButtonElement)?.disabled,
    );
    assert.equal(await page.locator('#run .run-label').textContent(), '実行');
    // The initial primary action ignores the example's existing breakpoint.
    await page.locator('#run').click();
    await page.waitForFunction(
      () => !(document.querySelector('#run-options') as HTMLButtonElement)?.disabled,
    );
    assert.match((await page.locator('#output').textContent())!, /JAL/);
    await page.locator('#run-options').click();
    assert.deepEqual(await page.locator('#run-options-menu button').allTextContents(), [
      'デバッグ',
      '実行',
    ]);
    await page.screenshot({ path: '.cache/run-menu.png' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#run-options-menu').isVisible(), false);
    await page.locator('#run-options').click();
    await page.locator('#run-without-breakpoints').click();
    await page.waitForFunction(() =>
      document.querySelector('#output')?.textContent!.includes('JAL'),
    );
    await page.waitForFunction(
      () => !(document.querySelector('#run-options') as HTMLButtonElement)?.disabled,
    );
    assert.equal(
      await page.locator('[data-command=debug-ignore-breakpoints]').getAttribute('aria-pressed'),
      'false',
    );
    assert.equal(await page.locator('.debug-breakpoint').count(), 1);
    await page.locator('#run-options').click();
    await page.locator('#run-with-debugger').click();
    await page.locator('.debug-toolbar[data-state=paused]').waitFor();
    assert.equal(await page.locator('#run-options').isDisabled(), true);
    await page.locator('#run').click();
    await page.waitForFunction(
      () => !(document.querySelector('#run-options') as HTMLButtonElement)?.disabled,
    );
    assert.equal(await page.locator('#run .run-label').textContent(), 'デバッグ');
    assert.equal(await page.locator('#run').getAttribute('aria-label'), 'デバッグ');
    // A shortcut outside Monaco repeats the selected debug action exactly once.
    await page.locator('#run').focus();
    await page.keyboard.press('Control+Enter');
    await page.locator('.debug-toolbar[data-state=paused]').waitFor();
    await page.locator('#run').click();
    assert.equal(await page.locator('#run .run-label').textContent(), 'デバッグ');
    await page
      .locator('[data-command=debug-ignore-breakpoints]')
      .evaluate((button) => (button as HTMLElement).click());
    await page.locator('#run-options').click();
    await page.locator('#run-without-breakpoints').click();
    await page.waitForFunction(() =>
      document.querySelector('#output')?.textContent!.includes('JAL'),
    );
    await page.waitForFunction(
      () => !(document.querySelector('#run-options') as HTMLButtonElement)?.disabled,
    );
    assert.equal(
      await page.locator('[data-command=debug-ignore-breakpoints]').getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(await page.locator('[data-command=debug-ignore-breakpoints]').isDisabled(), false);
    assert.equal(await page.locator('#run .run-label').textContent(), '実行');
  },
);
