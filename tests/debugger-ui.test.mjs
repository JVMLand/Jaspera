import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'Debug pane, gutter breakpoints and detached controls share the running VM',
  { timeout: 150000 },
  async (t) => {
    const base = 'http://127.0.0.1:5252',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5252', '--strictPort'],
        { stdio: 'pipe', windowsHide: true },
      );
    t.after(() => server.kill());
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
    const page = await newAppPage(browser, { viewport: { width: 1500, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(60000);
    await page.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await page.locator('#menu-file').click();
    await page.locator('#new-project').click();
    await page.locator('#instructions-tab').click();
    await page.getByRole('tab', { name: 'Main', exact: true }).click();
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      const offset = editor.getValue().indexOf('->out') + 3;
      editor.setPosition(editor.getModel().getPositionAt(offset));
      editor.focus();
    });
    await page.keyboard.press('F12');
    await page.waitForFunction(
      async () => (await import('/src/main.ts')).editor.getModel()?.uri.authority === 'definition',
    );
    await page.getByRole('tab', { name: 'Main', exact: true }).click();
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue(`public class Main {
 public static main([Ljava/lang/String;)V {
 iconst_2
 iconst_3
 iadd
 istore_1
 return
 }
}`);
      editor.setPosition({ lineNumber: 6, column: 1 });
      editor.focus();
    });
    await page.locator('#editor .jal-breakpoint-slot[data-line="6"]').click();
    await page.locator('.debug-breakpoint').waitFor();
    const gutter = await page
      .locator('#editor .jal-breakpoint-slot[data-line="6"]')
      .evaluate((node) => ({
        left: node.getBoundingClientRect().left,
        right: node.getBoundingClientRect().right,
        numberRight: node.previousElementSibling.getBoundingClientRect().right,
        offsetLeft: node.nextElementSibling.getBoundingClientRect().left,
      }));
    assert.ok(gutter.left >= gutter.numberRight && gutter.right <= gutter.offsetLeft);
    assert.equal(await page.locator('.debug-breakpoint').count(), 1);
    assert.equal(
      await page.evaluate(async () =>
        (await import('/src/main.ts')).editor.getSelection().isEmpty(),
      ),
      true,
    );
    await page.locator('#editor .jal-breakpoint-slot[data-line="6"]').click();
    await page.locator('.debug-breakpoint').waitFor({ state: 'hidden' });
    await page.locator('#editor .jal-breakpoint-slot[data-line="6"]').click();
    await page.locator('.debug-breakpoint').waitFor();
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.executeEdits('insert-line', [
        {
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          text: '// insertion before breakpoint\n',
        },
      ]);
    });
    // Hold runtime loading so breakpoint edits during startup are deterministic.
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    t.after(() => release());
    await page.route('**/runtime/bovine.js', async (route) => {
      await gate;
      await route.continue();
    });
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setPosition({ lineNumber: 7, column: 1 });
      await editor.getAction('jaspera.toggleBreakpoint').run();
    });
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.querySelector('.debug-toolbar')?.dataset.state === 'starting',
    );
    assert.equal(
      await page.locator('.debug-toolbar [data-command=debug-pause]').isDisabled(),
      true,
    );
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setPosition({ lineNumber: 7, column: 1 });
      await editor.getAction('jaspera.toggleBreakpoint').run();
    });
    release();
    await page.waitForFunction(
      () => document.querySelector('.debug-status')?.textContent === 'フレーム',
    );
    await page.locator('.debug-current-line').waitFor();
    assert.equal(await page.locator('.debug-current-line').count(), 1);
    await page.waitForFunction(() =>
      document.querySelector('#state')?.textContent.includes(' · 3 で停止中'),
    );
    assert.match(await page.locator('.debug-values').innerText(), /5/);
    await page.screenshot({ path: '.cache/debugger-ui.png' });
    await page.locator('.debug-toolbar [data-command=debug-over]').focus();
    const popupEvent = page.waitForEvent('popup');
    await page.locator('#debug-tab').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
    const popup = await popupEvent;
    popup.setDefaultTimeout(60000);
    await popup.waitForLoadState();
    await popup.locator('.debug-toolbar [data-command=debug-over]').waitFor();
    await popup.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10' }));
    });
    await popup.waitForFunction(() =>
      document.querySelector('.debug-values')?.textContent.includes('呼び出し元へ戻る'),
    );
    assert.match(await popup.locator('.debug-values').innerText(), /ローカル変数/);
    assert.match(await popup.locator('.debug-values').innerText(), /（変更無し）/);
    await popup.locator('.debug-toolbar [data-command=debug-continue]').click();
    await popup.waitForFunction(() =>
      document.querySelector('.debug-status')?.textContent.includes('デバッガは待機中です。'),
    );
    await page.waitForFunction(() => document.querySelector('.debug-toolbar')?.hidden === true);
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setPosition({ lineNumber: 7, column: 1 });
      await editor.getAction('jaspera.toggleBreakpoint').run();
    });
    await page.locator('.debug-breakpoint').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.debug-breakpoint').count(), 0);
    await page.evaluate(() => {
      window.__debugStops = 0;
      const observer = new MutationObserver(() => {
        if (document.querySelector('.debug-current-line')) window.__debugStops++;
      });
      observer.observe(document.querySelector('#editor'), { subtree: true, childList: true });
    });
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行が完了しました',
    );
    assert.equal(await page.evaluate(() => window.__debugStops), 0);
    await page.locator('.debug-toolbar').waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
  },
);
