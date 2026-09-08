import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'graph follows edits and selections, navigates to source, and works in a detached tab',
  { timeout: 150000 },
  async (t) => {
    const base = 'http://127.0.0.1:5221',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5221', '--strictPort'],
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
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.setDefaultTimeout(60000);
    await page.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    assert.equal(await page.locator('.graph-node,.instruction-usage').count(), 0);
    assert.equal(
      page.workers().some((w) => /graph-layout|elk-worker/.test(w.url())),
      false,
    );
    await page.locator('#graph-tab').click();
    await page.locator('.graph-node rect').first().waitFor();
    assert.equal(await page.locator('.graph-node').count(), 4);
    assert.ok((await page.locator('.graph-edge.stack').count()) > 0);
    await page.locator('.graph-node').filter({ hasText: 'ldc' }).click();
    assert.equal(
      await page.evaluate(
        async () => (await import('/src/main.ts')).editor.getPosition().lineNumber,
      ),
      5,
    );
    assert.equal(await page.locator('#graph-panel select,#graph-panel button').count(), 0);
    assert.equal(await page.locator('.graph-node-meta').count(), 0);
    const arithmetic = `public class Main { public static main([Ljava/lang/String;)V {
 getstatic java/lang/System->out:Ljava/io/PrintStream;
 bipush 7
 iconst_5
 iadd
 iconst_3
 imul
 invokevirtual java/io/PrintStream->println(I)V
 return
 } }`;
    await page.evaluate(
      async (source) => (await import('/src/main.ts')).editor.setValue(source),
      arithmetic,
    );
    await page.waitForFunction(() => document.querySelectorAll('.graph-node').length === 8);
    assert.equal(
      await page
        .locator('.graph-edge.control')
        .evaluateAll((paths) =>
          paths.every((path) => path.getAttribute('d').match(/-?[\d.]+/g).length === 4),
        ),
      true,
    );
    assert.equal(
      await page
        .locator('.graph-node')
        .evaluateAll(
          (nodes) =>
            new Set(
              nodes.map((n) =>
                Math.round(
                  (n.transform.baseVal.getItem(0).matrix.e +
                    Number(n.querySelector('rect').getAttribute('width')) / 2) *
                    1000,
                ),
              ),
            ).size,
        ),
      1,
    );
    await page
      .locator('#graph-panel')
      .screenshot({ path: '.cache/instruction-graph-straight.png' });
    const source = `public class Main {
 public static main([Ljava/lang/String;)V {
  iconst_0
  istore_1
 Loop:
  iinc 1 1
  iload_1
  bipush 10
  if_icmplt Loop
  return
 }
 public static other()I {
  iconst_2
  ireturn
 }
}`;
    await page.locator('#console-tab').click();
    await page.evaluate(
      async (source) => (await import('/src/main.ts')).editor.setValue(source),
      source,
    );
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.graph-node').count(), 8);
    await page.locator('#graph-tab').click();
    await page.waitForFunction(() => document.querySelectorAll('.graph-node').length === 9);
    await page.getByLabel('制御フロー', { exact: true }).uncheck();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.graph-node').length === 9 &&
        !document.querySelector('.graph-edge.control'),
    );
    await page.getByLabel('制御フロー', { exact: true }).check();
    await page.locator('.graph-edge.control').first().waitFor({ state: 'attached' });
    const transform = await page.locator('.graph-canvas>g').getAttribute('transform');
    await page.locator('.graph-canvas').hover();
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
    assert.notEqual(await page.locator('.graph-canvas>g').getAttribute('transform'), transform);
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setPosition({ lineNumber: 13, column: 3 });
    });
    assert.equal(await page.locator('.graph-node').count(), 9);
    assert.deepEqual(await page.locator('.graph-method').allTextContents(), [
      'main([Ljava/lang/String;)V',
      'other()I',
    ]);
    const diagonal = await page.locator('.graph-edge').evaluateAll((paths) =>
      paths.some((path) => {
        const points = path
          .getAttribute('d')
          .match(/-?[\d.]+/g)
          .map(Number);
        for (let i = 2; i < points.length; i += 2)
          if (
            Math.abs(points[i] - points[i - 2]) > 0.001 &&
            Math.abs(points[i + 1] - points[i - 1]) > 0.001
          )
            return true;
        return false;
      }),
    );
    assert.equal(diagonal, false);
    await page.screenshot({ path: '.cache/instruction-graph.png' });
    await page.evaluate(async () => {
      (await import('/src/themes.ts')).applyTheme('googol-light');
    });
    assert.equal(
      await page
        .locator('.graph-node text')
        .first()
        .evaluate((el) => getComputedStyle(el).fill),
      'rgb(32, 33, 36)',
    );
    await page.screenshot({ path: '.cache/instruction-graph-light.png' });
    await page.evaluate(async () => {
      (await import('/src/themes.ts')).applyTheme('jal-night');
    });
    const event = page.waitForEvent('popup');
    await page.locator('#graph-tab').click({ button: 'right' });
    await page.locator('.panel-context-menu').getByText('小窓で開く', { exact: true }).click();
    const popup = await event;
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.route('**/runtime/**', (r) => r.abort());
    await popup.locator('.graph-node').first().waitFor();
    assert.equal(
      popup.workers().some((w) => w.url().includes('runtime.worker')),
      false,
    );
    await popup.locator('.graph-node').filter({ hasText: 'bipush' }).click();
    assert.equal(
      await page.evaluate(
        async () => (await import('/src/main.ts')).editor.getPosition().lineNumber,
      ),
      8,
    );
    await page.evaluate(async () => {
      const { editor } = await import('/src/main.ts');
      editor.setValue('public class Main { public static x()V { nop return } }');
    });
    await popup.waitForFunction(() =>
      document.querySelector('.graph-node')?.textContent.includes('nop'),
    );
    assert.equal(await popup.locator('.graph-node').count(), 2);
    await popup.screenshot({ path: '.cache/instruction-graph-popup.png' });
    await popup.evaluate(() => {
      const group = new URL(location.href).searchParams.get('editor');
      const bridge = window.opener.jalwebDetached;
      const file = bridge.openTab(group, 'source:src/Main.jal');
      return bridge.openDefinition(group, file.uri, { lineNumber: 1, column: 1 });
    });
    await popup.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    await popup.evaluate(async () => {
      (await import('/src/detached.ts')).editor.setValue(
        'public class Main { public static x()I { iconst_5 ireturn } }',
      );
    });
    await popup.getByRole('tab', { name: 'Graph', exact: true }).click();
    await popup.waitForFunction(() =>
      document.querySelector('.graph-node')?.textContent.includes('iconst_5'),
    );
    await popup.locator('.graph-node').filter({ hasText: 'ireturn' }).click();
    assert.equal(
      await popup.getByRole('tab', { name: 'Main', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    assert.deepEqual(errors, []);
    await popup.close();
  },
);
