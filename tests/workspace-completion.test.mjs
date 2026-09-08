import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  launchBrowser,
  createTestProject,
  detachAt,
  newAppContext,
  newAppPage,
} from './helpers/browser.mjs';
test(
  'unbuilt workspace members complete across files and detached editors',
  { timeout: 60000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5191', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5191';
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
    const context = await newAppContext(browser, { viewport: { width: 1400, height: 900 } }),
      page = await context.newPage(),
      errors = [];
    context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/runtime/**', (r) => r.abort());
    await context.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    await page.goto(base);
    await createTestProject(page);
    await page.locator('#add-file').click();
    await page.locator('#dialog-input').fill('src/Helper.jal');
    await page.locator('#dialog-ok').click();
    await page.getByRole('tab', { name: 'Helper', exact: true }).waitFor();
    const helper = `public class Helper {
 public static answer:I
 public value:I
 public static twice(I)I { iload_0 iconst_2 imul ireturn }
 public static twice(J)J { lload_0 lreturn }
 public read()I { iconst_0 ireturn }
 public static broken()V { bipush ? return }
 }`;
    const setHelper = (source) =>
      page.evaluate(async (source) => {
        const { editor } = await import('/src/main.ts');
        editor.setValue(source);
      }, source);
    await setHelper(helper);
    await page.getByRole('button', { name: 'src/Helper.jal のタブを閉じる', exact: true }).click();
    await page.getByRole('tab', { name: 'Main', exact: true }).click();
    async function suggest(target, typed, entry = '/src/main.ts') {
      await target.keyboard.press('Escape');
      await target.evaluate(async (entry) => {
        const { editor } = await import(entry);
        editor.setValue(
          'public class Main {\n public static main([Ljava/lang/String;)V {\n  \n  return\n }\n}',
        );
        editor.setPosition({ lineNumber: 3, column: 3 });
        editor.focus();
      }, entry);
      await target.keyboard.type(typed, { delay: 20 });
    }
    const row = (target, text) =>
      target.locator('.suggest-widget.visible .monaco-list-row').filter({ hasText: text }).first();
    async function choose(target, text) {
      await row(target, text).waitFor();
      await row(target, text).click();
      await target.keyboard.press('Escape');
    }
    const source = (target, entry = '/src/main.ts') =>
      target.evaluate(async (entry) => (await import(entry)).editor.getValue(), entry);
    await suggest(page, 'invokestatic');
    await choose(page, 'Helper->twice(I)I');
    assert.match(await source(page), /invokestatic Helper->twice\(I\)I/);
    await suggest(page, 'invokestatic Helper.twice');
    await page.keyboard.press('Control+Space');
    await choose(page, 'Helper->twice(J)J');
    assert.match(await source(page), /invokestatic Helper->twice\(J\)J/);
    await suggest(page, 'getstatic Helper');
    await page.keyboard.press('Control+Space');
    await row(page, 'Helper->answer:I').waitFor();
    assert.equal(await row(page, 'Helper->value:I').count(), 0);
    await choose(page, 'Helper->answer:I');
    assert.match(await source(page), /getstatic Helper->answer:I/);
    await suggest(page, 'invokevirtual Helper');
    await page.keyboard.press('Control+Space');
    await row(page, 'Helper->read()I').waitFor();
    assert.equal(await row(page, 'Helper->twice(I)I').count(), 0);
    await choose(page, 'Helper->read()I');
    await page.locator('#file-list button[title="src/Helper.jal"]').click();
    await setHelper(helper.replaceAll('twice', 'doubleValue'));
    await page.getByRole('tab', { name: 'Main', exact: true }).click();
    await suggest(page, 'invokestatic Helper');
    await page.keyboard.press('Control+Space');
    await row(page, 'Helper->doubleValue(I)I').waitFor();
    assert.equal(await row(page, 'Helper->twice(I)I').count(), 0);
    await page.keyboard.press('Escape');
    const tab = await page.getByRole('tab', { name: 'Main', exact: true }).boundingBox(),
      event = page.waitForEvent('popup');
    await detachAt(page, tab);
    const popup = await event;
    await popup.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    await suggest(popup, 'invokestatic', '/src/detached.ts');
    await choose(popup, 'Helper->doubleValue(I)I');
    assert.match(await source(popup, '/src/detached.ts'), /invokestatic Helper->doubleValue\(I\)I/);
    await popup.close();
    assert.deepEqual(errors, []);
  },
);
