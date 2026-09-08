import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchBrowser, newAppPage, detachAt } from './helpers/browser.mjs';

test(
  'Alt shortcuts open localized menus from the editor in main and detached windows',
  { timeout: 60000 },
  async (t) => {
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5293, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    await page.goto('http://127.0.0.1:5293');
    const tab = page.getByRole('tab', { name: 'HelloWorld', exact: true });
    await tab.waitFor();
    await page.locator('.feature-guide-skip:visible').click();
    async function verify(view, entry) {
      for (const [key, menu] of [
        ['f', 'file'],
        ['e', 'edit'],
        ['v', 'view'],
        ['b', 'build'],
        ['d', 'debug'],
        ['h', 'help'],
      ]) {
        await view.evaluate(async (entry) => (await import(entry)).editor.focus(), entry);
        assert.equal(await view.locator('#menu-' + menu + ' u').textContent(), key.toUpperCase());
        assert.ok(
          (await view.locator('#menu-' + menu).textContent()).endsWith(
            '(' + key.toUpperCase() + ')',
          ),
        );
        await view.keyboard.press('Alt+' + key);
        assert.equal(await view.locator('#menu-' + menu).getAttribute('aria-expanded'), 'true');
        assert.equal(
          await view
            .locator('#popup-' + menu)
            .evaluate((el) => el.contains(document.activeElement)),
          true,
        );
        await view.keyboard.press('Escape');
        assert.equal(await view.locator('#popup-' + menu).isVisible(), false);
      }
      await view.evaluate(async (entry) => (await import(entry)).editor.focus(), entry);
      await view.keyboard.press('Control+Alt+f');
      assert.equal(await view.locator('#popup-file').isVisible(), false);
      await view.keyboard.press('Alt+v');
      await view.locator('#text-size-settings').click();
      await view.locator('#text-size-dialog[open]').waitFor();
      await view.keyboard.press('Alt+f');
      assert.equal(await view.locator('#popup-file').isVisible(), false);
      await view.keyboard.press('Escape');
    }
    await verify(page, '/src/main.ts');
    const event = page.waitForEvent('popup');
    await detachAt(page, await tab.boundingBox());
    const popup = await event;
    await popup.locator('.view-lines').first().waitFor();
    await verify(popup, '/src/detached.ts');
    await popup.close();
  },
);
