import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'tabs detach at viewport exit without waiting for release, in both hosts',
  { timeout: 60000 },
  async (t) => {
    const base = 'http://127.0.0.1:5240',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5240', '--strictPort'],
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
    const context = await browser.newContext({ viewport: { width: 1200, height: 850 } });
    await context.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    await context.route('**/runtime/**', (r) => r.abort());
    const page = await context.newPage();
    await page.goto(base);
    await page.locator('#project-tab').waitFor();
    const source = page.locator('[data-pane-key="source:src/Main.jal"] [role=tab]');
    await source.evaluate((node) => (window.draggedTab = node));
    const box = await source.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 15);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 20, { steps: 4 });
    await page.evaluate(() =>
      document.dispatchEvent(
        new DragEvent('dragleave', { bubbles: true, clientX: 500, clientY: 400 }),
      ),
    );
    assert.equal(context.pages().length, 1, 'moving inside the page must not detach');
    const firstEvent = context.waitForEvent('page');
    await page.mouse.move(1205, 200, { steps: 10 });
    const first = await firstEvent;
    await first.locator('#file-tabs [role=tab]').first().waitFor();
    assert.equal(await source.count(), 0);
    assert.match(
      await first.evaluate(async () => (await import('/src/detached.ts')).editor.getValue()),
      /Hello, World/,
    );
    await page.evaluate(() => {
      document.dispatchEvent(
        new DragEvent('dragleave', { bubbles: true, clientX: innerWidth + 1, clientY: 200 }),
      );
      window.draggedTab.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    });
    assert.equal(context.pages().length, 2, 'one popup per drag');
    // Split an existing popup; its sole tab moves and the empty source closes.
    const secondEvent = context.waitForEvent('page');
    await first
      .locator('#file-tabs [role=tab]')
      .first()
      .evaluate((node) => {
        const data = new DataTransfer();
        node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
        document.dispatchEvent(
          new DragEvent('dragleave', { bubbles: true, clientX: 100, clientY: -1 }),
        );
      });
    const second = await secondEvent;
    await second.locator('#file-tabs [role=tab]').first().waitFor();
    if (!first.isClosed()) await first.waitForEvent('close');
    assert.ok(first.isClosed());
    assert.match(
      await second.evaluate(async () => (await import('/src/detached.ts')).editor.getValue()),
      /Hello, World/,
    );
    // A panel uses the same exit path. No drop or mouse release is sent.
    const panelEvent = context.waitForEvent('page');
    await page.locator('#instructions-tab').evaluate((node) => {
      const data = new DataTransfer();
      node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
      document.dispatchEvent(
        new DragEvent('dragleave', { bubbles: true, clientX: -1, clientY: 200 }),
      );
    });
    const panel = await panelEvent;
    await panel.getByRole('tab', { name: 'Instructions', exact: true }).waitFor();
    // Existing-window drops still transfer the payload, including after auto-detach.
    const payload = await second
      .locator('#file-tabs [role=tab]')
      .first()
      .evaluate((node) => {
        const data = new DataTransfer();
        node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
        const payload = data.getData('application/x-jalweb-tab');
        node.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
        return payload;
      });
    await panel.locator('#file-tabs').evaluate((node, payload) => {
      const data = new DataTransfer();
      data.setData('application/x-jalweb-tab', payload);
      node.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    }, payload);
    await panel.locator('[data-pane-key="source:src/Main.jal"]').waitFor();
  },
);
