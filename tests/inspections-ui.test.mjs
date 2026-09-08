import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, createTestProject, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'live inspections and keyboard Quick Fix work without JVM and support Undo',
  { timeout: 60000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5186', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5186';
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await launchBrowser({
      headless: true,
    });
    t.after(() => browser.close());
    const page = await newAppPage(browser, { viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/runtime/**', (route) => route.abort());
    await page.goto(base);
    await createTestProject(page);
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue(
        'public class Main {\n public static main([Ljava/lang/String;)V {\n  bipush 1 // keep\n  pop\n  return\n }\n}',
      );
      editor.setPosition({ lineNumber: 3, column: 5 });
      editor.focus();
    });
    await page.waitForFunction(() =>
      document.querySelector('#problems')?.textContent.includes('iconst_1'),
    );
    await page.keyboard.press('Control+.');
    await page.getByText('iconst_1 に変更', { exact: true }).waitFor();
    await page.screenshot({ path: '.cache/inspection-quick-fix.png' });
    // Monaco shields the first pointer event after a keyboard-opened action menu.
    await page.mouse.move(20, 20);
    await page.getByText('iconst_1 に変更', { exact: true }).click();
    await page.waitForFunction(async () => {
      const { editor } = await import('/src/main.ts');
      return editor.getValue().includes('iconst_1  // keep');
    });
    await page.waitForFunction(() => document.querySelector('#problem-count')?.textContent === '0');
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.focus();
    });
    await page.keyboard.press('Control+z');
    await page.waitForFunction(async () => {
      const { editor } = await import('/src/main.ts');
      return editor.getValue().includes('bipush 1 // keep');
    });
    await page.waitForFunction(() =>
      document.querySelector('#problems')?.textContent.includes('iconst_1'),
    );
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue('public class Main { public static a()V { bipush 2 return } }');
      editor.setValue('public class Main { public static a()V { return } }');
    });
    await page.waitForFunction(() => document.querySelector('#problem-count')?.textContent === '0');
    assert.deepEqual(errors, []);
  },
);
