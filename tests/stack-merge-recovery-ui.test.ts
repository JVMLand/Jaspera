import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, createTestProject, newAppPage } from './helpers/browser.ts';

test(
  'invalid loop remains inspectable in WASM, with localized diagnostics',
  { timeout: 90000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5194', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5194';
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser, { viewport: { width: 1400, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await createTestProject(page);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue(
        'public class Main {\n public static main([Ljava/lang/String;)V {\n  ldc "hello"\n Print:\n  iconst_1\n  goto Print\n }\n}',
      );
    });
    await page.waitForFunction(() =>
      document.querySelector('#problems')?.textContent!.includes('ラベル「Print」'),
    );
    const marked = await page.evaluate(async () => {
      const model = (await import('/src/main.ts')).editor.getModel();
      return model!
        .getAllDecorations()
        .filter((d) => d.options.className?.includes('squiggly-error'))
        .map((d) => [d.range.startLineNumber, model!.getValueInRange(d.range)]);
    });
    assert.deepEqual(marked, [[4, 'Print']]);
    await page
      .locator('.view-line span')
      .filter({ hasText: /^iconst_1$/ })
      .first()
      .hover();
    const hover = page.locator('.stack-hover:visible');
    await hover.getByText('実行前', { exact: true }).waitFor();
    await hover.getByText(/解析途中のスタック/).waitFor();
    assert.match((await hover.textContent())!, /java.lang.String/);
    await page.screenshot({ path: '.cache/merge-hover.png' });
    await page.keyboard.press('Escape');
    await page.locator('#graph-tab').click();
    await page.waitForFunction(() => document.querySelectorAll('.graph-node').length === 3);
    assert.ok((await page.locator('.graph-edge.control').count()) > 0);
    await page.locator('.graph-status').filter({ hasText: '制御フローのみ' }).waitFor();
    await page.screenshot({ path: '.cache/merge-graph.png' });
    await page.evaluate(async () => (await import('/src/localization.ts')).setLocale('en'));
    await page
      .locator('.graph-status')
      .filter({ hasText: 'Incoming paths have different stack heights' })
      .waitFor();
    await page.locator('.graph-status').filter({ hasText: 'show control flow only' }).waitFor();
    assert.deepEqual(errors, []);
  },
);
