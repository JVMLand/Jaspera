import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'WASM stack errors underline the offending descriptor in Monaco',
  { timeout: 90000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5192', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5192';
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await chromium.launch({
      channel: process.env.JALWEB_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
      headless: true,
    });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue(
        'public class Main {\n public static main([Ljava/lang/String;)V {\n  getstatic java/lang/System->out:Ljava/io/PrintStream;\n  invokestatic Helper->compute()I\n  invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V\n  return\n }\n}',
      );
    });
    await page.waitForFunction(() =>
      document
        .querySelector('#problems')
        ?.textContent.includes(
          '第1引数には java.lang.String が必要ですが，スタック上の値は int です。',
        ),
    );
    const ranges = await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      const model = editor.getModel();
      return model
        .getAllDecorations()
        .filter((d) => d.options.className?.includes('squiggly-error'))
        .map((d) => ({ line: d.range.startLineNumber, text: model.getValueInRange(d.range) }));
    });
    assert.deepEqual(ranges, [{ line: 5, text: 'Ljava/lang/String;' }]);
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setPosition({
        lineNumber: 5,
        column: editor.getModel().getLineContent(5).indexOf('Ljava/lang/String;') + 2,
      });
      editor.focus();
      editor.trigger('test', 'editor.action.showHover', {});
    });
    await page.locator('.monaco-hover').filter({ hasText: '第1引数' }).waitFor();
    await page.screenshot({ path: '.cache/stack-diagnostic-descriptor.png' });
    assert.deepEqual(errors, []);
  },
);
