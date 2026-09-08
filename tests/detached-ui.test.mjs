import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'long press reorders tabs and detaches a synchronized Monaco editor',
  { timeout: 65000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5188', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5188';
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
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    for (const path of ['src/A.jal', 'src/B.jal']) {
      await page.locator('#add-file').click();
      await page.locator('#dialog-input').fill(path);
      await page.locator('#dialog-ok').click();
      await page.getByRole('tab', { name: path, exact: true }).waitFor();
    }
    const drag = async (name, x, y) => {
      const b = await page.getByRole('tab', { name, exact: true }).boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(420);
      await page.mouse.move(x, y, { steps: 8 });
      await page.mouse.up();
    };
    const first = await page.getByRole('tab', { name: 'src/Main.jal', exact: true }).boundingBox();
    await drag('src/B.jal', first.x + 2, first.y + 15);
    assert.deepEqual(await page.locator('#file-tabs [role=tab]').allTextContents(), [
      'src/B.jal',
      'src/Main.jal',
      'src/A.jal',
    ]);
    const popupEvent = page.waitForEvent('popup');
    await drag('src/B.jal', 1200, 15);
    const popup = await popupEvent;
    await popup.waitForFunction(() => document.querySelector('#file-tabs [role=tab]') !== null);
    assert.equal(await page.locator('#file-tabs [role=tab]').count(), 2);
    await popup.evaluate(async () => {
      const { editor } = await import('/src/detached.ts');
      editor.setValue('public class B { public static value()I { bipush 1 ireturn } }');
    });
    assert.equal(
      await page.evaluate(
        (id) => window.jalwebDetached.edit(id, -1, '').source,
        new URL(popup.url()).searchParams.get('editor'),
      ),
      'public class B { public static value()I { bipush 1 ireturn } }',
    );
    await popup.evaluate(async () => {
      const { editor } = await import('/src/detached.ts');
      editor.setPosition({ lineNumber: 1, column: 44 });
      editor.focus();
    });
    await popup.waitForFunction(async () => {
      const { editor } = await import('/src/detached.ts');
      const { currentInspections } = await import('/src/inspection-actions.ts');
      return currentInspections(editor.getModel()).some((i) => i.title === 'iconst_1 に変更');
    });
    await popup.waitForTimeout(500);
    await popup.keyboard.press('Control+.');
    await popup.getByText('iconst_1 に変更', { exact: true }).waitFor();
    await popup.keyboard.press('Enter');
    await popup.waitForFunction(async () => {
      const { editor } = await import('/src/detached.ts');
      return editor.getValue().includes('iconst_1');
    });
    await popup.keyboard.press('Control+z');
    await popup.waitForFunction(async () => {
      const { editor } = await import('/src/detached.ts');
      return editor.getValue().includes('bipush 1');
    });
    await page.evaluate((id) => {
      const state = window.jalwebDetached.edit(id, -1, '');
      window.jalwebDetached.edit(id, state.version, 'public class B { /* external */ }');
    }, new URL(popup.url()).searchParams.get('editor'));
    await popup.waitForFunction(async () => {
      const { editor } = await import('/src/detached.ts');
      return editor.getValue().includes('external');
    });
    await page.evaluate(async () => {
      const { applyTheme } = await import('/src/themes.ts');
      applyTheme('darcula');
    });
    await popup.waitForFunction(() => document.documentElement.dataset.theme === 'darcula');
    await popup.screenshot({ path: '.cache/detached-editor.png' });
    await popup.close();
    await page.getByRole('tab', { name: 'src/B.jal', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'src/B.jal', exact: true }).click();
    assert.match(
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        return editor.getValue();
      }),
      /external/,
    );
    // Blocked popups keep the tab and expose an explicit retry action.
    await page.evaluate(() => {
      window.originalOpen = window.open;
      window.open = () => null;
    });
    await drag('src/B.jal', 1200, 15);
    assert.equal(await page.locator('#file-tabs [role=tab]').count(), 3);
    await page.getByRole('button', { name: '小窓で開く', exact: true }).waitFor();
    await page.evaluate(() => {
      window.open = window.originalOpen;
    });
    const retryPopup = page.waitForEvent('popup');
    await page.getByRole('button', { name: '小窓で開く', exact: true }).click();
    const reopened = await retryPopup;
    await reopened.waitForFunction(() => document.querySelector('#file-tabs [role=tab]') !== null);
    await reopened.close();
    await page.getByRole('tab', { name: 'src/B.jal', exact: true }).waitFor();
    assert.deepEqual(errors, []);
  },
);
