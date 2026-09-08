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
  'tab labels update on collisions and close; popup and tree share the rules',
  { timeout: 60000 },
  async (t) => {
    const base = 'http://127.0.0.1:5219',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5219', '--strictPort'],
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
    const page = await newAppPage(browser, { viewport: { width: 1400, height: 950 } });
    await page.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    await createTestProject(page);
    const tab = (target, path) => target.locator(`[data-tab-key="source:${path}"] [role=tab]`);
    await page.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    assert.equal(
      await page.locator('#file-list button[title="src/Main.jal"]').textContent(),
      'Main',
    );
    for (const path of ['src/a/common/Helper', 'src/b/common/Helper']) {
      await page.locator('#add-file').click();
      await page.locator('#dialog-input').fill(path);
      await page.keyboard.press('Enter');
      await tab(page, path + '.jal').waitFor();
    }
    assert.equal(await tab(page, 'src/a/common/Helper.jal').textContent(), 'a/common/Helper');
    assert.equal(await tab(page, 'src/b/common/Helper.jal').textContent(), 'b/common/Helper');
    assert.match(
      await tab(page, 'src/a/common/Helper.jal').getAttribute('title'),
      /src\/a\/common\/Helper.jal/,
    );
    await page.locator('[data-tab-key="source:src/b/common/Helper.jal"] .tab-close').click();
    assert.equal(await tab(page, 'src/a/common/Helper.jal').textContent(), 'Helper');
    await page.locator('#file-list button[title="src/b/common/Helper.jal"]').click();
    assert.equal(await tab(page, 'src/b/common/Helper.jal').textContent(), 'b/common/Helper');
    const rect = await tab(page, 'src/a/common/Helper.jal').boundingBox(),
      event = page.waitForEvent('popup');
    await detachAt(page, rect);
    const popup = await event;
    await popup.getByRole('tab', { name: 'Helper', exact: true }).waitFor();
    assert.equal(await tab(page, 'src/b/common/Helper.jal').textContent(), 'Helper');
    await popup.evaluate(() => {
      const group = new URL(location.href).searchParams.get('editor'),
        bridge = window.opener.jalwebDetached;
      bridge.openTab(group, 'source:src/b/common/Helper.jal');
    });
    await popup.getByRole('tab', { name: 'b/common/Helper', exact: true }).waitFor();
    assert.equal(await tab(popup, 'src/a/common/Helper.jal').textContent(), 'a/common/Helper');
    await tab(popup, 'src/b/common/Helper.jal').click();
    const download = popup.waitForEvent('download');
    await popup.locator('#menu-file').click();
    await popup.locator('#save-file-as').click();
    assert.equal((await download).suggestedFilename(), 'Helper.jal');
    await popup.close();
  },
);
