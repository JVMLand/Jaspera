import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  launchBrowser,
  detachAt,
  createTestProject,
  newAppContext,
  newAppPage,
} from './helpers/browser.mjs';
test(
  'format works from menus, shortcut and popup, with undo and unchanged compilation',
  { timeout: 90000 },
  async (t) => {
    const base = 'http://127.0.0.1:5216',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5216', '--strictPort'],
        { stdio: 'pipe', windowsHide: true },
      );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await launchBrowser({ headless: true });
    t.after(() => browser.close());
    const context = await newAppContext(browser, { viewport: { width: 1450, height: 1000 } }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await createTestProject(page);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    const source =
      'public class Main { public static main([Ljava/lang/String;)V { goto End End: return } }';
    await page.evaluate(async (source) => {
      const { editor } = await import('/src/main.ts');
      editor.setValue(source);
    }, source);
    await page.locator('#menu-edit').click();
    await page.locator('#format').click();
    await page.waitForFunction(async () =>
      (await import('/src/main.ts')).editor.getValue().includes('\n  End:\n    return'),
    );
    const formatted = await page.evaluate(async () =>
      (await import('/src/main.ts')).editor.getValue(),
    );
    await page.waitForFunction(() => document.querySelectorAll('.view-line').length >= 7);
    await page.screenshot({ path: '.cache/formatter.png' });
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.focus();
      editor.trigger('test', 'undo', null);
    });
    assert.equal(
      await page.evaluate(async () => (await import('/src/main.ts')).editor.getValue()),
      source,
    );
    await page.keyboard.press('Shift+Alt+f');
    await page.waitForFunction(
      async (expected) => (await import('/src/main.ts')).editor.getValue() === expected,
      formatted,
    );
    const results = await page.evaluate(
      async ({ source, formatted }) => {
        const { Runtime } = await import('/src/runtime.ts');
        const runtime = new Runtime();
        try {
          return [await runtime.compile(source), await runtime.compile(formatted)].map((r) => ({
            diagnostics: r.diagnostics,
            bytecode: r.bytecode,
          }));
        } finally {
          runtime.stop();
        }
      },
      { source, formatted },
    );
    assert.deepEqual(results[0].diagnostics, []);
    assert.deepEqual(results[1].diagnostics, []);
    assert.equal(results[0].bytecode, results[1].bytecode);
    const tab = await page.getByRole('tab', { name: 'Main', exact: true }).boundingBox(),
      event = page.waitForEvent('popup');
    await detachAt(page, tab);
    const popup = await event;
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    await popup.evaluate(async (source) => {
      const { editor } = await import('/src/detached.ts');
      editor.setValue(source);
    }, source);
    await popup.locator('#menu-edit').click();
    await popup.locator('#format').click();
    await popup.waitForFunction(
      async (expected) => (await import('/src/detached.ts')).editor.getValue() === expected,
      formatted,
    );
    await popup.locator('.view-line').first().click({ button: 'right' });
    await popup.getByRole('menuitem', { name: /Format Document/ }).waitFor();
    await popup.keyboard.press('Escape');
    await popup.close();
    assert.deepEqual(errors, []);
  },
);
