import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppPage } from './helpers/browser.mjs';

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
    const page = await newAppPage(browser, { viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5196');
    await page.getByRole('tab', { name: 'HelloWorld', exact: true }).waitFor();
    const skipGuide = page.getByRole('button', { name: 'すべてスキップ', exact: true });
    if (await skipGuide.isVisible()) await skipGuide.click();
    const original = await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      const source = editor.getValue();
      assertExample(editor.getModel().uri.authority);
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
      document.querySelector('#problems')?.textContent.includes('example/HelloWorld.jal:'),
    );
    const ranges = await page.evaluate(async () => {
      const model = (await import('/src/main.ts')).editor.getModel();
      return model
        .getAllDecorations()
        .filter((d) => d.options.className?.includes('squiggly-error'))
        .map((d) => ({ line: d.range.startLineNumber, text: model.getValueInRange(d.range) }));
    });
    assert.equal(ranges.length, 1);
    assert.equal(ranges[0].line, 5);
    assert.equal(ranges[0].text, 'Ljava/lang/String;');
    await page.locator('#problems-tab').click();
    await page.locator('#problems button.error').click();
    assert.equal(
      await page.evaluate(
        async () => (await import('/src/main.ts')).editor.getPosition().lineNumber,
      ),
      5,
    );
    await page.screenshot({ path: '.cache/example-diagnostics.png' });
    await page.evaluate(
      async (source) => (await import('/src/main.ts')).editor.setValue(source),
      original,
    );
    await page.waitForFunction(
      () => !document.querySelector('#problems')?.textContent.includes('example/HelloWorld.jal:'),
    );
    await page.waitForFunction(
      async () =>
        !(await import('/src/main.ts')).editor
          .getModel()
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
      document.querySelector('#problems')?.textContent.includes('example/HelloWorld.jal:'),
    );
    await page
      .getByRole('button', { name: 'example/HelloWorld.jal のタブを閉じる', exact: true })
      .click();
    await page.waitForFunction(
      () => !document.querySelector('#problems')?.textContent.includes('example/HelloWorld.jal:'),
    );
    await page.locator('#file-list button[title="example/HelloWorld.jal"]').click();
    await page.waitForFunction(() =>
      document.querySelector('#problems')?.textContent.includes('example/HelloWorld.jal:'),
    );
    assert.deepEqual(errors, []);
  },
);
