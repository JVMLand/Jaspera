import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'shared pane tabs move bidirectionally between main and detached windows',
  { timeout: 90000 },
  async (t) => {
    const base = 'http://127.0.0.1:5206',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5206', '--strictPort'],
        { stdio: 'pipe', windowsHide: true },
      );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await chromium.launch({
      channel: process.platform === 'win32' ? 'msedge' : 'chromium',
      headless: true,
    });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } }),
      page = await context.newPage(),
      errors = [];
    context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.stack)));
    page.on('pageerror', (e) => errors.push(e.stack));
    await context.route('**/runtime/**', (r) => r.abort());
    await page.goto(base);
    await page.locator('#project-tab').waitFor();
    const tab = (p, name) => p.getByRole('tab', { name, exact: true });
    const open = async (name) => {
      const event = page.waitForEvent('popup');
      await page.locator('#' + name + '-tab').click({ button: 'right' });
      await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
      const popup = await event;
      await popup.locator('#file-tabs [role=tab]').first().waitFor();
      return popup;
    };
    // Separate browser windows cannot share a Playwright mouse. Transfer the actual
    // dragstart payload through each window's native DataTransfer/drop handlers.
    async function transfer(source, target) {
      const payload = await source.evaluate((node) => {
        const data = new DataTransfer();
        node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
        const payload = data.getData('application/x-jalweb-tab');
        node.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
        return payload;
      });
      assert.ok(payload);
      await target.evaluate((node, payload) => {
        const data = new DataTransfer();
        data.setData('application/x-jalweb-tab', payload);
        const box = node.getBoundingClientRect();
        node.ownerDocument.body.dispatchEvent(
          new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }),
        );
        node.dispatchEvent(
          new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }),
        );
        node.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: box.left + 3,
            clientY: box.top + 8,
            dataTransfer: data,
          }),
        );
        if (node.ownerDocument.querySelector('.dock-drop-target'))
          throw new Error('Drop highlight survived the transfer');
      }, payload);
    }
    await page.locator('#add-file').click();
    await page.locator('#dialog-input').fill('src/Helper.jal');
    await page.locator('#dialog-ok').click();
    await tab(page, 'src/Main.jal').click();
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.executeEdits('test', [
        {
          range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
          text: '// unsaved transfer\n',
        },
      ]);
      editor.setPosition({ lineNumber: 2, column: 6 });
    });
    const first = await open('instructions');
    await transfer(tab(page, 'src/Main.jal'), first.locator('#file-tabs'));
    await tab(first, 'src/Main.jal').waitFor();
    await page.waitForFunction(
      () => !document.querySelector('[data-tab-key="source:src/Main.jal"]'),
    );
    assert.deepEqual(
      await first.evaluate(async () => {
        const { editor } = await import('/src/detached.ts');
        return {
          line: editor.getPosition().lineNumber,
          column: editor.getPosition().column,
          edited: editor.getValue().includes('unsaved transfer'),
        };
      }),
      { line: 2, column: 6, edited: true },
    );
    const second = await open('problems');
    await transfer(tab(first, 'src/Main.jal'), second.locator('#file-tabs'));
    await tab(second, 'src/Main.jal').waitFor();
    assert.equal(await tab(first, 'src/Main.jal').count(), 0);
    await transfer(tab(second, 'src/Main.jal'), page.locator('.output-header'));
    await page
      .locator('.output-pane')
      .getByRole('tab', { name: 'src/Main.jal', exact: true })
      .waitFor();
    assert.equal(await tab(second, 'src/Main.jal').count(), 0);
    assert.deepEqual(
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        return {
          line: editor.getPosition().lineNumber,
          column: editor.getPosition().column,
          edited: editor.getValue().includes('unsaved transfer'),
        };
      }),
      { line: 2, column: 6, edited: true },
    );
    await page.keyboard.press('Control+z');
    assert.equal(
      await page.evaluate(async () =>
        (await import('/src/main.ts')).editor.getValue().includes('unsaved transfer'),
      ),
      false,
    );
    // Tool tabs and tree files use exactly the same transfer path.
    await transfer(tab(first, 'Instructions'), page.locator('.source-header'));
    await page.locator('.source-pane #instructions-tab').waitFor();
    assert.ok(first.isClosed());
    await transfer(page.locator('#project-tab'), second.locator('#file-tabs'));
    await tab(second, 'Project').waitFor();
    await transfer(
      second.locator('#file-list button[title="src/Helper.jal"]'),
      page.locator('.project-heading'),
    );
    await page
      .locator('.project-pane')
      .getByRole('tab', { name: 'src/Helper.jal', exact: true })
      .waitFor();
    await transfer(page.locator('#instructions-tab'), second.locator('#file-tabs'));
    await tab(second, 'Instructions').waitFor();
    await transfer(tab(second, 'Project'), page.locator('.project-heading'));
    await page.locator('.project-pane #project-tab').waitFor();
    await transfer(tab(second, 'Instructions'), page.locator('.output-header'));
    await page.locator('.output-pane #instructions-tab').waitFor();
    const close = second.waitForEvent('close');
    await transfer(tab(second, 'Problems'), page.locator('.source-header'));
    await close;
    assert.ok(second.isClosed());
    // Actual native dragging in one window retains arbitrary mixed tab order.
    await page
      .locator('#instructions-tab')
      .dragTo(page.locator('.output-pane [data-pane-key="source:src/Main.jal"]'), {
        targetPosition: { x: 2, y: 12 },
      });
    assert.deepEqual(
      await page
        .locator('.output-header [data-pane-key]')
        .evaluateAll((ns) => ns.filter((n) => !n.hidden).map((n) => n.dataset.paneKey))
        .then((keys) => keys.slice(0, 2)),
      ['panel:instructions', 'source:src/Main.jal'],
    );
    const count = await page.locator('[data-pane-key]').count();
    await page.locator('.source-pane').evaluate((node) => {
      const data = new DataTransfer();
      data.setData(
        'application/x-jalweb-tab',
        JSON.stringify({ workspace: 'other-project', key: 'source:src/Main.jal' }),
      );
      node.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    });
    assert.equal(await page.locator('[data-pane-key]').count(), count);
    await page.locator('#instructions-tab').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page
        .locator('.output-pane [data-pane-key="source:src/Main.jal"] [role=tab]')
        .getAttribute('aria-selected'),
      'true',
    );
    await tab(page, 'src/Main.jal').click({ modifiers: ['Alt'] });
    assert.equal(
      await page
        .locator('.output-header [data-pane-key]')
        .evaluateAll((ns) => ns.filter((n) => !n.hidden).length),
      1,
    );
    assert.deepEqual(errors, []);
  },
);
