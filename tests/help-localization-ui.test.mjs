import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchBrowser, newAppPage } from './helpers/browser.mjs';
test(
  'guide and menu language changes are complete and preserve the selected topic',
  { timeout: 120000 },
  async (t) => {
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5266, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser, { locale: 'en-US' });
    await page.goto('http://127.0.0.1:5266');
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    await page.locator('#menu-help').click();
    await page.locator('#help-manual').click();
    await page.locator('#feature-manual article h2').waitFor();
    const breakpointLines = () =>
      page.evaluate(async () => {
        const model = (await import('/src/main.ts')).editor.getModel();
        return model
          .getAllDecorations()
          .filter((d) => d.options.description === 'debug-breakpoint-anchor')
          .map((d) => d.range.startLineNumber);
      });
    const initialBreakpoints = await breakpointLines();
    assert.equal(initialBreakpoints.length, 1);
    for (const lang of ['en', 'zh', 'es', 'it', 'fr', 'la', 'ja', 'en']) {
      await page.evaluate(
        async (lang) => (await import('/src/localization.ts')).setLocale(lang),
        lang,
      );
      assert.equal(await page.locator('html').getAttribute('lang'), lang);
      assert.deepEqual(
        await breakpointLines(),
        initialBreakpoints,
        'language changes retain the breakpoint',
      );
      const labels = await page.locator('#feature-manual nav button').allTextContents();
      assert.equal(labels.length, 10);
      if (lang !== 'ja') assert.doesNotMatch(labels.join(' '), /[\u3040-\u30ff]/);
      for (let i = 0; i < 10; i++) {
        await page.locator('#feature-manual nav button').nth(i).click();
        const body = await page.locator('#feature-manual article').textContent();
        assert.ok(body.length > 80);
        if (lang !== 'ja') assert.doesNotMatch(body, /[\u3040-\u30ff]/);
      }
      assert.ok(await page.locator('#feature-manual article').textContent());
      // Bound menubar labels update synchronously, independently of the legacy observer.
      assert.ok((await page.locator('#menu-help').textContent()).length > 0);
    }
    await page.locator('#feature-manual nav button').nth(8).click();
    assert.equal(await page.locator('#feature-manual article tbody tr').count(), 14);
    assert.ok((await page.locator('#feature-manual article kbd').count()) > 14);
    await page.locator('.manual-close').click();
    await page.locator('#feature-manual').waitFor({ state: 'detached' });
    await page.evaluate(async (line) => {
      const { editor } = await import('/src/main.ts');
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    }, initialBreakpoints[0]);
    await page.keyboard.press('F9');
    assert.deepEqual(await breakpointLines(), []);
    await page.evaluate(async () => (await import('/src/localization.ts')).setLocale('fr'));
    assert.deepEqual(
      await breakpointLines(),
      [],
      'removed breakpoints must not be recreated by translation',
    );
  },
);
