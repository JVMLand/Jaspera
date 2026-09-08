import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, createTestProject, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'instruction selection is transient, diagrams align, and clicks follow across detached tools',
  { timeout: 90000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5198', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5198';
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
    const page = await newAppPage(browser, { viewport: { width: 1450, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    await createTestProject(page);
    await page.locator('#instructions-tab').click();
    const panel = page.locator('#instructions-panel'),
      chooser = panel.locator('.instruction-chooser'),
      search = panel.getByLabel('命令を検索');
    assert.equal(await chooser.isVisible(), false);
    assert.equal(await panel.locator('.instruction-reading').count(), 0);
    assert.equal(await panel.locator('details.instruction-advanced').count(), 0);
    await panel.locator('.frame-rest').first().waitFor();
    const rests = await panel
      .locator('.frame-rest')
      .evaluateAll((es) =>
        es.map((e) => ({ text: e.textContent, bottom: e.getBoundingClientRect().bottom })),
      );
    assert.equal(rests[0].text, '⋯');
    assert.ok(Math.abs(rests[0].bottom - rests[1].bottom) < 1);
    await search.click();
    assert.equal(await chooser.isVisible(), true);
    await search.evaluate((n) => n.blur());
    assert.equal(await chooser.isVisible(), true);
    await page.locator('#instructions-tab').click();
    assert.equal(await chooser.isVisible(), false);
    const heading = panel.locator('.instruction-detail>header h2');
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setPosition({ lineNumber: 4, column: 5 });
    });
    assert.equal(await heading.textContent(), 'iadd');
    const op = (name) =>
      page
        .locator('.view-line span')
        .filter({ hasText: new RegExp('^' + name + '$') })
        .last();
    await op('getstatic').click();
    assert.equal(await heading.textContent(), 'getstatic');
    await page.keyboard.press('ArrowDown');
    assert.equal(await heading.textContent(), 'getstatic');
    await search.click();
    await search.fill('lconst_0');
    await page.locator('#instructions-tab').click();
    assert.match(await panel.locator('.instruction-category-note').textContent(), /2スロット/);
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#instructions-tab').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
    const popup = await popupPromise;
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.getByRole('tab', { name: '命令辞書', exact: true }).waitFor();
    await op('ldc').click();
    await popup.waitForFunction(
      () => document.querySelector('.instruction-detail>header h2')?.textContent === 'ldc',
    );
    await popup.getByRole('menuitem', { name: '表示', exact: true }).click();
    await popup.getByRole('menuitem', { name: '問題', exact: true }).click();
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue(
        'public class Main {\n public static main([Ljava/lang/String;)V {\n bipush 1\n pop\n return\n }\n}',
      );
    });
    await popup.locator('#problems button').first().waitFor();
    await popup.locator('#problems button').first().click();
    await popup.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    assert.equal(await popup.locator('#editor').isVisible(), true);
    await popup.getByRole('tab', { name: '命令辞書', exact: true }).click();
    await popup.screenshot({ path: '.cache/instructions-revised-popup.png' });
    await popup.close();
    await page.locator('#instructions-tab').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
  },
);
