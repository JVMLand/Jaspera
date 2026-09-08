import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
const source = `public class Main {
 public static main([Ljava/lang/String;)V {
  goto End
 End: return
 }
 public static loop()V {
 Loop: iconst_0
  ifeq Loop
  goto Loop
 }
 public static other()V {
  goto End
 End: return
 }
}`;
test(
  'Shift-click follows scoped labels and shows multiple uses in both windows',
  { timeout: 150000 },
  async (t) => {
    const base = 'http://127.0.0.1:5227',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5227', '--strictPort'],
        { stdio: 'pipe', windowsHide: true },
      );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await page.evaluate(
      async (source) => (await import('/src/main.ts')).editor.setValue(source),
      source,
    );
    async function clickLabel(view, module, line, label) {
      const point = await view.evaluate(
        async ({ module, line, label }) => {
          const { editor } = await import(module);
          const column = editor.getModel().getLineContent(line).indexOf(label) + 2;
          editor.revealLineInCenterIfOutsideViewport(line);
          await new Promise(requestAnimationFrame);
          const p = editor.getScrolledVisiblePosition({ lineNumber: line, column }),
            r = editor.getDomNode().getBoundingClientRect();
          return { x: r.x + p.left + 2, y: r.y + p.top + p.height / 2 };
        },
        { module, line, label },
      );
      await view.keyboard.down('Shift');
      await view.mouse.click(point.x, point.y);
      await view.keyboard.up('Shift');
    }
    async function at(view, module, line) {
      await view.waitForFunction(
        async ({ module, line }) => (await import(module)).editor.getPosition().lineNumber === line,
        { module, line },
      );
    }
    for (const [from, to] of [
      [3, 4],
      [4, 3],
      [12, 13],
      [13, 12],
    ]) {
      await clickLabel(page, '/src/main.ts', from, 'End');
      await at(page, '/src/main.ts', to);
    }
    await clickLabel(page, '/src/main.ts', 7, 'Loop');
    await page.locator('.peekview-widget').waitFor({ state: 'visible' });
    assert.match(await page.locator('.peekview-widget').innerText(), /Loop/);
    await page.locator('.ref-tree .monaco-list-row').filter({ hasText: 'ifeq Loop' }).dblclick();
    await at(page, '/src/main.ts', 8);
    await page.keyboard.press('Escape');
    const tab = await page.getByRole('tab', { name: 'Main', exact: true }).boundingBox(),
      event = page.waitForEvent('popup');
    await page.mouse.move(tab.x + 20, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(1200, 15, { steps: 8 });
    await page.mouse.up();
    const popup = await event;
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    await clickLabel(popup, '/src/detached.ts', 3, 'End');
    await at(popup, '/src/detached.ts', 4);
    await clickLabel(popup, '/src/detached.ts', 4, 'End');
    await at(popup, '/src/detached.ts', 3);
    await clickLabel(popup, '/src/detached.ts', 7, 'Loop');
    await popup.locator('.peekview-widget').waitFor({ state: 'visible' });
    await popup.locator('.ref-tree .monaco-list-row').filter({ hasText: 'goto Loop' }).dblclick();
    await at(popup, '/src/detached.ts', 9);
    assert.deepEqual(errors, []);
    await popup.close();
  },
);
