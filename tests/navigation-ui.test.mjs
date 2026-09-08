import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, createTestProject, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'Ctrl-hover and click resolve workspace and OpenJDK definitions',
  { timeout: 160000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5189';
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
    const page = await newAppPage(browser, { viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    await page.goto(base);
    await page.locator('.feature-guide-skip:visible').click();
    await createTestProject(page);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 60000 },
    );
    const state = () =>
      page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        return {
          uri: editor.getModel()?.uri.toString(),
          line: editor.getModel()?.getLineContent(editor.getPosition().lineNumber),
          column: editor.getPosition().column,
          readOnly: editor.getRawOptions().readOnly,
          source: editor.getValue(),
        };
      });
    const main = () => page.getByRole('tab', { name: 'Main', exact: true }).click();
    async function jump(text, within = 0) {
      const at = await page.evaluate(
        async ({ text, within }) => {
          const { editor } = await import('/src/main.ts');
          const offset = editor.getValue().indexOf(text);
          if (offset < 0) throw new Error('Reference missing ' + text);
          const p = editor.getModel().getPositionAt(offset + within);
          editor.revealPositionInCenter(p);
          editor.setPosition(p);
          editor.focus();
          const q = editor.getScrolledVisiblePosition(p),
            box = editor.getDomNode().getBoundingClientRect();
          return { x: box.left + q.left + 3, y: box.top + q.top + q.height / 2 };
        },
        { text, within },
      );
      const count = await page.locator('#file-tabs [role=tab]').count();
      await page.keyboard.down('Control');
      await page.mouse.move(at.x, at.y);
      await page.locator('.goto-definition-link').first().waitFor({ timeout: 60000 });
      assert.equal(
        await page.locator('#file-tabs [role=tab]').count(),
        count,
        'hover must not open a tab',
      );
      await page.mouse.click(at.x, at.y);
      await page.keyboard.up('Control');
      await page.waitForTimeout(150);
    }
    await t.test(
      'System.out opens its actual field declaration without creating an editable source',
      async () => {
        await jump('->out', 3);
        const s = await state();
        await page.screenshot({ path: '.cache/system-out-definition.png' });
        assert.match(s.uri, /definition.*java\/lang\/System/);
        assert.match(s.line, /out:Ljava\/io\/PrintStream;/);
        assert.equal(s.readOnly, true);
        assert.equal(await page.locator('#file-list button[title^=\"src/\"]').count(), 1);
      },
    );
    await t.test('owner and descriptor types open the class declaration', async () => {
      await main();
      await jump('Ljava/io/PrintStream;', 4);
      assert.match((await state()).line, /class java\/io\/PrintStream /);
    });
    await t.test(
      'overloaded methods resolve by the full descriptor and reopen a closed definition',
      async () => {
        await main();
        await jump('->println', 3);
        assert.match((await state()).line, /println\(Ljava\/lang\/String;\)V/);
        await page
          .getByRole('button', {
            name: 'java/io/PrintStream.class (JAL) のタブを閉じる',
            exact: true,
          })
          .click();
        await main();
        await page.evaluate(async () => {
          const { editor } = await import('/src/main.ts');
          editor.setValue(editor.getValue().replace('println(Ljava/lang/String;)V', 'println(I)V'));
        });
        await jump('->println', 3);
        assert.match((await state()).line, /println\(I\)V/);
      },
    );
    await t.test('inherited members lead to their declaring class', async () => {
      await main();
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        editor.setValue(
          'public class Main { public static main([Ljava/lang/String;)V {\n invokevirtual java/io/PrintStream->getClass()Ljava/lang/Class;\n return\n} }',
        );
      });
      await jump('->getClass', 3);
      assert.match((await state()).uri, /java\/lang\/Object/);
      assert.match((await state()).line, /getClass\(\)Ljava\/lang\/Class;/);
    });
    await t.test('workspace definitions are selected exactly and remain editable', async () => {
      await page.locator('#add-file').click();
      await page.locator('#dialog-input').fill('src/Helper.jal');
      await page.locator('#dialog-ok').click();
      await page.getByRole('tab', { name: 'Helper', exact: true }).waitFor();
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        editor.setValue(
          'public class Helper {\n public static foo(I)V { return }\n public static foo(Ljava/lang/String;)V { return }\n}',
        );
      });
      await main();
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        editor.setValue(
          'public class Main { public static main([Ljava/lang/String;)V {\n invokestatic Helper->foo(I)V\n return\n} }',
        );
      });
      await jump('->foo', 3);
      const s = await state();
      assert.match(s.uri, /src\/Helper.jal/);
      assert.match(s.line, /foo\(I\)V/);
      assert.equal(s.readOnly, false);
    });
    await t.test(
      'a detached editor can preview and open a definition in the workspace',
      async (t) => {
        await main();
        const event = page.waitForEvent('popup');
        await page.locator('#instructions-tab').click({ button: 'right' });
        await page.getByRole('menuitem', { name: '小窓で開く', exact: true }).click();
        const popup = await event;
        t.after(async () => {
          if (!popup.isClosed()) await popup.close();
          await page.getByRole('tab', { name: 'Main', exact: true }).waitFor();
        });
        popup.on('pageerror', (e) => errors.push(e.message));
        await popup.waitForFunction(() => document.querySelector('#file-tabs [role=tab]') !== null);
        const payload = await page
          .getByRole('tab', { name: 'Main', exact: true })
          .evaluate((node) => {
            const data = new DataTransfer();
            node.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
            const payload = data.getData('application/x-jalweb-tab');
            node.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
            return payload;
          });
        assert.ok(payload);
        await popup.locator('#file-tabs').evaluate((node, payload) => {
          const data = new DataTransfer();
          data.setData('application/x-jalweb-tab', payload);
          node.dispatchEvent(
            new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
          );
        }, payload);
        await popup.getByRole('tab', { name: 'Main', exact: true }).waitFor();
        await popup.bringToFront();
        const at = await popup.evaluate(async () => {
          await document.fonts.ready;
          const { editor } = await import('/src/detached.ts');
          editor.focus();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const p = editor.getModel().getPositionAt(editor.getValue().indexOf('->foo') + 3);
          editor.revealPositionInCenter(p);
          const q = editor.getScrolledVisiblePosition(p),
            b = editor.getDomNode().getBoundingClientRect();
          return { x: b.left + q.left + 3, y: b.top + q.top + q.height / 2 };
        });
        await popup.keyboard.down('Control');
        await popup.mouse.move(at.x, at.y);
        await popup.locator('.goto-definition-link').first().waitFor();
        await popup.mouse.click(at.x, at.y);
        await popup.keyboard.up('Control');
        await popup.waitForFunction(async () => {
          const { editor } = await import('/src/detached.ts');
          return editor.getModel()?.uri.path === '/src/Helper.jal';
        });
        assert.match(
          await popup.evaluate(async () => {
            const { editor } = await import('/src/detached.ts');
            return editor.getModel().getLineContent(editor.getPosition().lineNumber);
          }),
          /foo\(I\)V/,
        );
        await popup.close();
        await page.getByRole('tab', { name: 'Main', exact: true }).waitFor();
      },
    );
    await t.test('an unavailable class does not produce a broken destination', async () => {
      await main();
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        editor.setValue(
          'public class Main { public static main([Ljava/lang/String;)V { new missing/NoSuchClass return } }',
        );
        const offset = editor.getValue().indexOf('missing/') + 2;
        editor.setPosition(editor.getModel().getPositionAt(offset));
        editor.focus();
      });
      await page.keyboard.press('F12');
      await page
        .locator('.monaco-editor-overlaymessage')
        .filter({ hasText: 'No definition found' })
        .waitFor();
      assert.match((await state()).uri, /src\/Main.jal/);
    });
    await t.test(
      'workspace JAL takes precedence over an already opened library definition',
      async () => {
        await page.locator('#add-file').click();
        await page.locator('#dialog-input').fill('src/Shadow.jal');
        await page.locator('#dialog-ok').click();
        await page.getByRole('tab', { name: 'Shadow', exact: true }).waitFor();
        await page.evaluate(async () => {
          const { editor } = await import('/src/main.ts');
          editor.setValue(
            'public class java/lang/System { public static out:Ljava/io/PrintStream; }',
          );
        });
        await main();
        await page.evaluate(async () => {
          const { editor } = await import('/src/main.ts');
          editor.setValue(
            'public class Main { public static main([Ljava/lang/String;)V {\n getstatic java/lang/System->out:Ljava/io/PrintStream;\n return\n} }',
          );
        });
        await jump('->out', 3);
        const s = await state();
        assert.match(s.uri, /src\/Shadow.jal/);
        assert.equal(s.readOnly, false);
      },
    );
    await page.screenshot({ path: '.cache/definition-navigation.png' });
    assert.deepEqual(errors, []);
  },
);
