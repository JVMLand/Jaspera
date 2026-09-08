import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, createTestProject, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'empty detached windows close after source and tool removals or transfers',
  { timeout: 60000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5200', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5200';
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
    const context = await newAppContext(browser),
      page = await context.newPage(),
      errors = [];
    context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    await createTestProject(page);
    const open = async (name) => {
      const popup = page.waitForEvent('popup');
      await page.locator('#' + name + '-tab').click({ button: 'right' });
      await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
      const p = await popup;
      await p.locator('#file-tabs [role=tab]').first().waitFor();
      return p;
    };
    const first = await open('instructions'),
      firstClosed = first.waitForEvent('close');
    await first.getByRole('button', { name: '命令辞書 のタブを閉じる', exact: true }).click();
    await firstClosed;
    await page.locator('#instructions-tab').waitFor();
    const mixed = await open('instructions');
    await mixed.evaluate(() => {
      const b = window.opener.jalwebDetached,
        g = new URL(location.href).searchParams.get('editor'),
        state = b.openTab(g, 'source:src/Main.jal');
      return b.openDefinition(g, state.uri, { lineNumber: 1, column: 1 });
    });
    await mixed.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    await mixed.getByRole('button', { name: '命令辞書 のタブを閉じる', exact: true }).click();
    assert.equal(mixed.isClosed(), false);
    await mixed.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    const closing = mixed.waitForEvent('close');
    await mixed.getByRole('button', { name: 'src/Main.jal のタブを閉じる', exact: true }).click();
    await closing;
    await page.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    const source = await open('instructions'),
      target = await open('problems'),
      sourceClosed = source.waitForEvent('close');
    await target.evaluate(() =>
      window.opener.jalwebDetached.openPanel(
        new URL(location.href).searchParams.get('editor'),
        'instructions',
      ),
    );
    await sourceClosed;
    assert.equal(target.isClosed(), false);
    await target.getByRole('tab', { name: '命令辞書', exact: true }).waitFor();
    await target.close();
    assert.deepEqual(errors, []);
  },
);
