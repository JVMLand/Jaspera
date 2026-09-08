import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchBrowser, newAppPage, createTestProject, detachAt } from './helpers/browser.mjs';
test(
  'Run follows the configured entry and rejects invalid main in both windows and shortcuts',
  { timeout: 90000 },
  async (t) => {
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5269, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('http://127.0.0.1:5269');
    await createTestProject(page);
    const edit = async (source) =>
      page.evaluate(
        async (source) => (await import('/src/main.ts')).editor.setValue(source),
        source,
      );
    const enabled = async (value) =>
      page.waitForFunction((value) => document.querySelector('#run').disabled === !value, value);
    for (const signature of [
      'public static main()V',
      'main()V',
      'public main([Ljava/lang/String;)V',
      'public static main([Ljava/lang/String;)V',
    ]) {
      await edit(`public class Main { ${signature} { return } }`);
      await enabled(true);
    }
    for (const body of [
      'public helper()V {return}',
      'private main()V {return}',
      'public main(I)V {return}',
      'public main()I {iconst_0 ireturn}',
    ]) {
      await edit(`public class Main { ${body} }`);
      await enabled(false);
      await page.waitForFunction(() =>
        document.querySelector('#run').title.includes('main メソッドがありません'),
      );
      await page.waitForFunction(() =>
        document.querySelector('#state').textContent.includes('main メソッドがありません'),
      );
    }
    await page.keyboard.press('F5');
    assert.equal(await page.locator('.debug-toolbar:visible').count(), 0);
    await page.locator('#menu-build').click();
    assert.equal(await page.locator('#menu-run').isDisabled(), true);
    await page.keyboard.press('Escape');
    await page.locator('#add-file').click();
    await page.locator('#dialog-input').fill('src/Helper');
    await page.locator('#dialog-ok').click();
    await page.getByRole('tab', { name: 'Helper', exact: true }).waitFor();
    await edit('public class Helper {public static main()V {return}}');
    await enabled(false);
    await page.getByRole('tab', { name: 'Main', exact: true }).click();
    await edit('public class Main {public main()V {return}}');
    await enabled(true);
    const event = page.waitForEvent('popup');
    await detachAt(page, await page.getByRole('tab', { name: 'Main', exact: true }).boundingBox());
    const popup = await event;
    await popup.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    await popup.evaluate(async () =>
      (await import('/src/detached.ts')).editor.setValue('public class Main {}'),
    );
    await popup.waitForFunction(() => document.querySelector('#menu-run').disabled);
    await popup.keyboard.press('F5');
    assert.equal(await page.locator('.debug-toolbar:visible').count(), 0);
    await popup.evaluate(async () =>
      (await import('/src/detached.ts')).editor.setValue(
        'public class Main {public main()V {return}}',
      ),
    );
    await popup.waitForFunction(() => !document.querySelector('#menu-run').disabled);
    await popup.close();
    assert.deepEqual(errors, []);
  },
);
