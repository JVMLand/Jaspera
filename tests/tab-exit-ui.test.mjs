import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';

test('tabs detach at release only; an accepted cross-window drop wins', async (t) => {
  const { outputFiles } = await build({
    entryPoints: ['src/tab-interactions.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'Tabs',
  });
  const browser = await launchBrowser({
    headless: true,
  });
  t.after(() => browser.close());
  const context = await newAppContext(browser, { viewport: { width: 800, height: 600 } });
  const main = await context.newPage(),
    child = await context.newPage();
  for (const page of [main, child]) {
    await page.setContent(
      '<div id="tab" data-pane-key="source:src/Main.jal"><button>Tab</button></div><div id="target">Drop here</div>',
    );
    await page.addScriptTag({ content: outputFiles[0].text });
    await page.evaluate(() => {
      window.detached = [];
      window.received = [];
      Tabs.paneDrag(document.querySelector('#tab'), 'workspace', 'source:src/Main.jal');
      Tabs.paneDrop(document.querySelector('#target'), 'workspace', (key) => received.push(key));
      window.exit = Tabs.paneWindowExit('workspace', (key) => detached.push(key));
    });
  }
  const start = (page) =>
    page.evaluate(() => {
      window.transfer = new DataTransfer();
      document
        .querySelector('#tab button')
        .dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      return transfer.getData('application/x-jalweb-tab');
    });
  const leave = (page) =>
    page.evaluate(() =>
      document.dispatchEvent(
        new DragEvent('dragleave', { bubbles: true, clientX: 900, clientY: 100 }),
      ),
    );
  const end = (page, x, y, effect = 'none') =>
    page.evaluate(
      ({ x, y, effect }) => {
        Object.defineProperty(transfer, 'dropEffect', { value: effect, configurable: true });
        document.querySelector('#tab button').dispatchEvent(
          new DragEvent('dragend', {
            bubbles: true,
            clientX: x,
            clientY: y,
            dataTransfer: transfer,
          }),
        );
      },
      { x, y, effect },
    );
  for (const [source, target] of [
    [child, main],
    [main, child],
  ]) {
    const payload = await start(source);
    assert.equal(JSON.parse(payload).key, 'source:src/Main.jal');
    await leave(source);
    assert.deepEqual(
      await source.evaluate(() => detached),
      [],
      'crossing the viewport must not detach',
    );
    const effect = await target.evaluate((payload) => {
      const data = new DataTransfer();
      Object.defineProperty(data, 'dropEffect', { value: 'none', writable: true });
      data.setData('application/x-jalweb-tab', payload);
      document
        .querySelector('#target')
        .dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
        );
      return data.dropEffect;
    }, payload);
    assert.equal(effect, 'move');
    await end(source, 900, 100, effect);
    assert.deepEqual(
      await source.evaluate(() => detached),
      [],
      'successful transfer must not detach again',
    );
    assert.deepEqual(await target.evaluate(() => received), ['source:src/Main.jal']);
  }
  await start(child);
  await leave(child);
  await end(child, 300, 200);
  assert.deepEqual(
    await child.evaluate(() => detached),
    [],
    'returning inside before release cancels detachment',
  );
  await start(child);
  await leave(child);
  await child.evaluate(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  await end(child, 900, 100);
  assert.deepEqual(await child.evaluate(() => detached), [], 'Escape cancels detachment');
  await start(child);
  await leave(child);
  await end(child, 0, 0);
  assert.deepEqual(
    await child.evaluate(() => detached),
    [],
    'cancelled native drag coordinates do not detach',
  );
  await start(child);
  await leave(child);
  await end(child, 900, 100);
  await end(child, 900, 100);
  assert.deepEqual(
    await child.evaluate(() => detached),
    ['source:src/Main.jal'],
    'outside release detaches once',
  );
  await main.evaluate(() => {
    document.querySelector('#tab').dataset.paneKey = 'tool:instructions';
    Tabs.paneDrag(document.querySelector('#tab'), 'workspace', 'tool:instructions');
  });
  await start(main);
  await leave(main);
  await end(main, -20, 100);
  assert.deepEqual(
    await main.evaluate(() => detached),
    ['tool:instructions'],
    'tool tabs use the same release rule',
  );
});
