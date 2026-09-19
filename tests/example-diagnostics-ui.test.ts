import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppPage } from './helpers/browser.ts';

test(
  'editing an example reports missing println operands without running or hovering',
  { timeout: 90000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch('http://127.0.0.1:5196')).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser, {
      viewport: { width: 1400, height: 900 },
      theme: 'googol-light',
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5196');
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    const skipGuide = page.getByRole('button', { name: 'すべてスキップ', exact: true });
    if (await skipGuide.isVisible()) await skipGuide.click();
    const original = await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      const source = editor.getValue();
      assertExample(editor.getModel()!.uri.authority);
      editor.setValue(
        source
          .split('\n')
          .filter((line) => !/^\s*ldc\s/.test(line))
          .join('\n'),
      );
      return source;
      function assertExample(authority) {
        if (authority !== 'example') throw new Error('Expected example model');
      }
    });
    await page.waitForFunction(() =>
      document.querySelector('#problems')?.textContent!.includes('example/HelloWorld.jal:'),
    );
    const ranges = await page.evaluate(async () => {
      const model = (await import('/src/main.ts')).editor.getModel();
      return model!
        .getAllDecorations()
        .filter((d) => d.options.className?.includes('squiggly-error'))
        .map((d) => ({ line: d.range.startLineNumber, text: model!.getValueInRange(d.range) }));
    });
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].line, 5);
    assert.equal(ranges[0].text, 'Ljava/lang/String;');
    await page
      .locator('.view-line span')
      .filter({ hasText: /^invokevirtual$/ })
      .first()
      .hover();
    const hover = page.locator('.stack-hover:visible');
    await hover.locator('.frame-missing').waitFor();
    assert.match((await hover.locator('.frame-missing').textContent())!, /\bString\b/);
    await page.keyboard.press('Escape');
    await page.evaluate(async () => (await import('/src/localization.ts')).setLocale('en'));
    await page
      .locator('.view-line span')
      .filter({ hasText: /^invokevirtual$/ })
      .first()
      .hover();
    await hover.locator('.frame-missing').filter({ hasText: 'Missing: String' }).waitFor();
    const clip = await hover.evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      const line = [...document.querySelectorAll('.view-line')].find((line) =>
        line.textContent?.includes('invokevirtual'),
      )!;
      const range = document.createRange();
      range.selectNodeContents(line);
      const instruction = range.getBoundingClientRect();
      const x = Math.max(0, Math.floor(Math.min(bounds.left, instruction.left)) - 6);
      const y = Math.max(0, Math.floor(Math.min(bounds.top, instruction.top)) - 6);
      return {
        x,
        y,
        width: Math.ceil(Math.max(bounds.right, instruction.right)) + 6 - x,
        height: Math.ceil(Math.max(bounds.bottom, instruction.bottom)) + 6 - y,
      };
    });
    await page.screenshot({ path: '.cache/missing-stack-hover.png', clip });
    await page.keyboard.press('Escape');
    await page.evaluate(async () => (await import('/src/localization.ts')).setLocale('ja'));
    await page.locator('#problems-tab').click();
    await page.locator('#problems button.error').click();
    assert.equal(
      await page.evaluate(
        async () => (await import('/src/main.ts')).editor.getPosition()!.lineNumber,
      ),
      5,
    );
    await page.screenshot({ path: '.cache/example-diagnostics.png' });
    await page.evaluate(
      async (source) => (await import('/src/main.ts')).editor.setValue(source),
      original,
    );
    await page.waitForFunction(
      () => !document.querySelector('#problems')?.textContent!.includes('example/HelloWorld.jal:'),
    );
    await page.waitForFunction(
      async () =>
        !(await import('/src/main.ts')).editor
          .getModel()!
          .getAllDecorations()
          .some((d) => d.options.className?.includes('squiggly-error')),
    );
    // Closing an invalid example removes its diagnostics; reopening analyzes the saved edit.
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue(
        editor
          .getValue()
          .split('\n')
          .filter((line) => !/^\s*ldc\s/.test(line))
          .join('\n'),
      );
    });
    await page.waitForFunction(() =>
      document.querySelector('#problems')?.textContent!.includes('example/HelloWorld.jal:'),
    );
    await page
      .getByRole('button', { name: 'example/HelloWorld.jal のタブを閉じる', exact: true })
      .click();
    await page.waitForFunction(
      () => !document.querySelector('#problems')?.textContent!.includes('example/HelloWorld.jal:'),
    );
    await page.locator('#file-list button[title="example/HelloWorld.jal"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#problems')?.textContent!.includes('example/HelloWorld.jal:'),
    );
    assert.deepEqual(errors, []);
  },
);
