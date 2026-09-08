import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'project context actions use the clicked file and preserve detached editors',
  { timeout: 60000 },
  async (t) => {
    const base = 'http://127.0.0.1:5220',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5220', '--strictPort'],
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
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    const file = (path) => page.locator(`#file-list button[title="${path}"]`),
      folder = (path) => page.locator(`#file-list summary[title="${path}"]`),
      menu = page.locator('.panel-context-menu');
    const enter = async (value) => {
      await page.locator('#dialog-input').fill(value);
      await page.keyboard.press('Enter');
    };
    await page.locator('#project-tab').click({ button: 'right' });
    assert.equal(await menu.getByText('新規 JAL ファイル…', { exact: true }).count(), 1);
    await page.keyboard.press('Escape');
    await folder('src').click({ button: 'right' });
    await menu.getByText('新規 JAL ファイル…', { exact: true }).click();
    assert.equal(await page.locator('#dialog-input').inputValue(), 'src/Helper');
    await enter('src/group/Helper');
    await file('src/group/Helper.jal').waitFor();
    await file('src/Main.jal').click({ button: 'right' });
    await menu.getByText('名前を変更…', { exact: true }).click();
    assert.equal(await page.locator('#dialog-input').inputValue(), 'Main');
    await enter('Renamed');
    await file('src/Renamed.jal').waitFor();
    assert.match(
      await page.evaluate(async () => (await import('/src/main.ts')).editor.getValue()),
      /class group\/Helper/,
    );
    await folder('src/group').click({ button: 'right' });
    await menu.getByText('名前を変更…', { exact: true }).click();
    await enter('tools');
    await file('src/tools/Helper.jal').waitFor();
    await file('src/Renamed.jal').click({ button: 'right' });
    await menu.getByText('移動…', { exact: true }).click();
    await enter('src/tools');
    await file('src/tools/Renamed.jal').waitFor();
    await file('src/tools/Helper.jal').click();
    const rect = await page
        .locator('[data-tab-key="source:src/tools/Helper.jal"] [role=tab]')
        .boundingBox(),
      event = page.waitForEvent('popup');
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(420);
    await page.mouse.move(1200, 15, { steps: 8 });
    await page.mouse.up();
    const popup = await event;
    await popup.getByRole('tab', { name: 'Helper', exact: true }).waitFor();
    await folder('src/tools').click({ button: 'right' });
    await menu.getByText('移動…', { exact: true }).click();
    await enter('lib');
    await file('lib/tools/Helper.jal').waitFor();
    await popup.locator('[data-tab-key="source:lib/tools/Helper.jal"] [role=tab]').waitFor();
    assert.equal(popup.isClosed(), false);
    assert.equal(
      await popup.evaluate(
        async () => (await import('/src/detached.ts')).editor.getModel().uri.path,
      ),
      '/lib/tools/Helper.jal',
    );
    await popup.evaluate(async () => {
      (await import('/src/detached.ts')).editor.setValue('public class Changed {}');
    });
    await popup.close();
    await file('lib/tools/Helper.jal').click();
    assert.equal(
      await page.evaluate(async () => (await import('/src/main.ts')).editor.getValue()),
      'public class Changed {}',
    );
    await file('lib/tools/Helper.jal').click({ button: 'right' });
    await menu.getByText('名前を変更…', { exact: true }).click();
    await enter('Renamed');
    await page.getByRole('heading', { name: '変更できませんでした' }).waitFor();
    await page.locator('#dialog-ok').click();
    assert.equal(await file('lib/tools/Helper.jal').count(), 1);
    await file('example/HelloWorld.jal').click({ button: 'right' });
    assert.equal(await menu.getByText('名前を変更…', { exact: true }).count(), 0);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
  },
);
