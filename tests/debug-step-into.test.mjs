import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'step into OpenJDK reveals and highlights the actual disassembled instruction',
  { timeout: 120000 },
  async (t) => {
    const base = 'http://127.0.0.1:5253';
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5253', '--strictPort'],
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
    const page = await newAppPage(browser, { viewport: { width: 1500, height: 1000 } });
    page.setDefaultTimeout(60000);
    await page.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await page.evaluate(async () => {
      window.testMain = await import('/src/main.ts');
    });
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.querySelector('.debug-toolbar')?.dataset.state === 'paused',
    );
    await page.locator('.debug-toolbar [data-command=debug-into]').click();
    await page.waitForFunction(() => {
      const { editor } = window.testMain;
      const marker = document.querySelector('.debug-current-marker');
      return (
        editor.getModel()?.uri.authority === 'definition' &&
        marker &&
        Number(marker.getAttribute('data-line')) === editor.getPosition().lineNumber
      );
    });
    const read = () =>
      page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        const model = editor.getModel();
        const marker = document.querySelector('.debug-current-marker');
        const line = Number(marker.dataset.line);
        return {
          uri: model.uri.toString(),
          line,
          position: editor.getPosition().lineNumber,
          text: model.getLineContent(line).trim(),
          status: document.querySelector('#state').textContent,
        };
      });
    const first = await read();
    assert.match(first.uri, /PrintStream/);
    assert.equal(first.position, first.line);
    assert.equal(first.text, 'aload_0');
    const scroll = await page.evaluate((line) => {
      const { editor } = window.testMain;
      editor.setScrollTop(editor.getTopForLineNumber(line) - 80);
      return editor.getScrollTop();
    }, first.line);
    await page.locator('.debug-toolbar [data-command=debug-over]').click();
    await page.waitForFunction(
      (old) =>
        document.querySelector('.debug-current-marker')?.getAttribute('data-line') !==
          String(old) && !!document.querySelector('.debug-current-marker'),
      first.line,
    );
    const next = await read();
    assert.equal(next.position, next.line);
    assert.notEqual(next.line, first.line);
    assert.notEqual(next.text, first.text);
    assert.equal(
      await page.evaluate(() => window.testMain.editor.getScrollTop()),
      scroll,
      'visible execution line must not recenter',
    );
    await page.evaluate(() => window.testMain.editor.setScrollTop(0));
    await page.locator('.debug-toolbar [data-command=debug-over]').click();
    await page.waitForFunction((old) => {
      const { editor } = window.testMain;
      const line = editor.getPosition().lineNumber;
      return (
        line !== old &&
        editor
          .getVisibleRanges()
          .some((r) => r.startLineNumber <= line && r.endLineNumber >= line) &&
        !!document.querySelector('.debug-current-marker')
      );
    }, next.line);
    assert.ok(
      (await page.evaluate(() => window.testMain.editor.getScrollTop())) > 0,
      'offscreen execution line must become visible',
    );
    await page.screenshot({ path: '.cache/debug-step-into.png' });
    await page.locator('.debug-frames button').nth(1).click();
    const caller = await page.locator('.debug-values').innerText();
    assert.match(caller, /呼び出し時/);
    assert.match(caller, /PrintStream/);
    assert.match(caller, /こんにちは，JAL！/);
    assert.doesNotMatch(caller, /呼び出し先へ移動|呼び出し先の実行待ち/);
    await page.screenshot({ path: '.cache/debug-caller-frame.png' });
    await page.locator('.debug-toolbar [data-command=debug-stop]').click();
    await page.locator('.debug-current-marker').waitFor({ state: 'hidden' });
  },
);
