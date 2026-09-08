import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, createTestProject, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'three resizable groups accept tree files, project tabs and detached drops',
  { timeout: 90000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5199', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5199';
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
    const context = await newAppContext(browser, { viewport: { width: 1450, height: 1000 } }),
      page = await context.newPage(),
      errors = [];
    context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    await createTestProject(page);
    await page.locator('#project-tab').waitFor();
    assert.equal(await page.getByRole('separator').count(), 2);
    await page.locator('#add-file').click();
    await page.locator('#dialog-input').fill('src/Helper.jal');
    await page.locator('#dialog-ok').click();
    await page.locator('.source-pane').getByRole('tab', { name: 'Helper', exact: true }).waitFor();
    await page
      .locator('#file-list button[title="src/Main.jal"]')
      .dragTo(page.locator('.output-header'));
    await page.locator('.output-pane').getByRole('tab', { name: 'Main', exact: true }).waitFor();
    assert.equal(
      await page.locator('.source-pane').getByRole('tab', { name: 'Main', exact: true }).count(),
      0,
    );
    assert.match(await page.locator('.output-pane .group-editor').innerText(), /Hello/);
    assert.match(await page.locator('.source-pane .group-editor').innerText(), /Helper/);
    const before = await page.locator('.project-pane').boundingBox(),
      split = await page.locator('.separator-0').boundingBox();
    await page.mouse.move(split.x + 3, split.y + 120);
    await page.mouse.down();
    await page.mouse.move(split.x + 70, split.y + 120, { steps: 8 });
    await page.mouse.up();
    const after = await page.locator('.project-pane').boundingBox();
    assert.ok(after.width > before.width + 40);
    const project = await page.locator('#project-tab').boundingBox(),
      out = await page.locator('.output-header').boundingBox();
    await page.mouse.move(project.x + 20, project.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(190);
    await page.mouse.move(out.x + 90, out.y + 20, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator('.output-pane #project-tab').count(), 1);
    assert.equal(await page.locator('.project-pane #project-tab').count(), 0);
    await page
      .locator('#file-list button[title="src/Main.jal"]')
      .dragTo(page.locator('.project-heading'));
    await page.locator('.project-pane').getByRole('tab', { name: 'Main', exact: true }).waitFor();
    assert.match(await page.locator('.project-pane .group-editor').innerText(), /Hello/);
    assert.equal(
      await page
        .locator('.project-pane')
        .getByRole('tab', { name: 'Main', exact: true })
        .getAttribute('aria-selected'),
      'true',
    );
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#instructions-tab').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
    const popup = await popupPromise;
    await popup.getByRole('tab', { name: '命令辞書', exact: true }).waitFor();
    const payload = await page
      .locator('#file-list button[title="src/Helper.jal"]')
      .evaluate((node) => {
        const data = new DataTransfer();
        node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
        return data.getData('application/x-jalweb-tab');
      });
    await popup.locator('#file-tabs').evaluate((node, payload) => {
      const data = new DataTransfer();
      data.setData('application/x-jalweb-tab', payload);
      node.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    }, payload);
    await popup.getByRole('tab', { name: 'Helper', exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector('.workspace [data-tab-key="source:src/Helper.jal"]'),
    );
    await popup.evaluate(async () => {
      const { editor } = await import('/src/detached.ts');
      editor.setValue('public class Helper { // synced\n}');
    });
    await page.waitForFunction(async () => {
      const m = await import('/node_modules/monaco-editor/esm/vs/editor/editor.api.js');
      return m.editor.getModels().some((model) => model.getValue().includes('// synced'));
    });
    await popup.getByRole('menuitem', { name: '表示', exact: true }).click();
    await popup.getByRole('menuitem', { name: 'プロジェクト', exact: true }).click();
    await popup.locator('#file-list button[title="src/Main.jal"]').waitFor();
    await popup.close();
    await page.locator('.source-pane').getByRole('tab', { name: 'Helper', exact: true }).waitFor();
    await page.screenshot({ path: '.cache/three-groups.png' });
    for (const theme of ['japan-light', 'hitachi-dark', 'denden-light']) {
      await page.evaluate(async (theme) => {
        const { applyTheme } = await import('/src/themes.ts');
        applyTheme(theme);
      }, theme);
      assert.equal(await page.getByRole('separator').count(), 2);
      const panes = await page
        .locator('.dock-pane')
        .evaluateAll((ns) => ns.map((n) => n.getBoundingClientRect().width));
      assert.ok(panes.every((w) => w > 80));
    }
    await page.setViewportSize({ width: 700, height: 950 });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.separator-0').getAttribute('aria-orientation'), 'horizontal');
    assert.deepEqual(errors, []);
  },
);
