import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'method frames fill progressively, stay usable, and ignore obsolete results',
  { timeout: 90000 },
  async (t) => {
    const base = 'http://127.0.0.1:5228',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5228', '--strictPort'],
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
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    page.setDefaultTimeout(15000);
    await page.addInitScript(() => {
      localStorage.setItem('jalweb.theme', 'vs-dark');
      window.layoutCalls = 0;
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message, ...args) {
        if (message?.path?.includes('positionGraphs')) window.layoutCalls++;
        return post.call(this, message, ...args);
      };
    });
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await page.evaluate(async () => {
      const { installInstructionGraph } = await import('/src/instruction-graph.ts');
      const host = document.createElement('section');
      host.id = 'progress-probe';
      host.style.cssText = 'position:fixed;inset:20px;width:850px;height:750px;z-index:9999';
      document.body.append(host);
      window.jobs = [];
      window.graphFor = (name) => ({
        name: name + '()V',
        nodes: [
          {
            id: 'n0',
            text: 'return',
            opcode: 'return',
            block: 'entry',
            line: 2,
            column: 1,
            consumed: 0,
            produced: 0,
            unreachable: false,
          },
        ],
        edges: [],
      });
      window.progressPanel = installInstructionGraph(
        host,
        (doc, progress) => new Promise((resolve) => window.jobs.push({ doc, progress, resolve })),
        (doc, line) => {
          window.visited = true;
          window.visitedLine = line;
        },
      );
      window.progressPanel.update({
        uri: 'inmemory://jal/Progress.jal',
        source:
          'public class Progress { public static first()V { return } public static second()V { return } public static third()V { return } }',
        version: 1,
        line: 1,
        column: 1,
      });
    });
    await page.waitForFunction(() => window.jobs?.length === 1);
    await page.evaluate(() =>
      window.jobs[0].progress({
        phase: 'queued',
        completed: 0,
        total: 0,
        waitingFor: '同じ文書の先行解析の完了待ち',
      }),
    );
    assert.ok(
      (await page.locator('#progress-probe .graph-method-state').allTextContents()).every((s) =>
        s.includes('同じ文書の先行解析の完了待ち'),
      ),
    );
    await page.evaluate(() =>
      window.jobs[0].progress({ phase: 'parse', completed: 50, total: 100 }),
    );
    assert.match(await page.locator('#progress-probe .graph-status').innerText(), /構文解析 50%/);
    await page.evaluate(() =>
      window.jobs[0].progress({ phase: 'analysis', method: 'first()V', completed: 0, total: 3 }),
    );
    assert.match(await page.locator('#progress-probe .graph-status').innerText(), /first\(\)V/);
    assert.match(
      await page.locator('#progress-probe .graph-method-state').nth(2).textContent(),
      /first の型・フロー解析待ち/,
    );
    assert.equal(await page.locator('#progress-probe .graph-method-progress').count(), 3);
    assert.equal(await page.locator('#progress-probe .graph-node').count(), 0);
    await page.evaluate(() => {
      window.jobs[0].progress({
        phase: 'frames',
        method: 'first()V',
        completed: 1,
        total: 3,
        finished: true,
        graph: window.graphFor('first'),
      });
      window.jobs[0].progress({
        phase: 'analysis',
        method: 'second()V',
        completed: 2,
        total: 3,
        finished: true,
      });
    });
    await page.locator('#progress-probe .graph-node rect').waitFor();
    assert.equal(await page.locator('#progress-probe .graph-method-progress').count(), 2);
    assert.deepEqual(
      await page
        .locator('#progress-probe .graph-method-progress')
        .evaluateAll((rects) => rects.map((r) => r.getAttribute('aria-valuenow'))),
      ['33', '0'],
    );
    await page.locator('#progress-probe').screenshot({ path: '.cache/progressive-graph.png' });
    await page.locator('#progress-probe .graph-node rect').click();
    assert.equal(await page.evaluate(() => window.visited), true);
    await page.evaluate(() =>
      window.progressPanel.update({
        uri: 'inmemory://jal/Fresh.jal',
        source: 'public class Fresh { public static fresh()V { return } }',
        version: 2,
        line: 1,
        column: 1,
      }),
    );
    await page.waitForFunction(() => window.jobs.length === 2);
    await page.evaluate(() => {
      window.jobs[0].progress({
        phase: 'frames',
        method: 'third()V',
        completed: 3,
        total: 3,
        finished: true,
        graph: window.graphFor('third'),
      });
      window.jobs[0].resolve({
        diagnostics: [],
        graphs: [window.graphFor('first'), window.graphFor('third')],
      });
      window.jobs[1].resolve({ diagnostics: [], graphs: [window.graphFor('fresh')] });
    });
    await page.waitForFunction(() =>
      document.querySelector('#progress-probe .graph-status')?.textContent.includes(' · 100% · '),
    );
    assert.deepEqual(await page.locator('#progress-probe .graph-method').allTextContents(), [
      'fresh()V',
    ]);
    assert.equal(await page.locator('#progress-probe .graph-node').count(), 1);
    const freshCalls = await page.evaluate(() => window.layoutCalls);
    await page.evaluate(() => {
      window.freshDoc = window.jobs[1].doc;
      window.progressPanel.update({
        uri: 'inmemory://jal/Other.jal',
        source: 'public class Other { public static other()V { return } }',
        version: 1,
        line: 1,
        column: 1,
      });
    });
    await page.waitForFunction(() => window.jobs.length === 3);
    await page.evaluate(() =>
      window.jobs[2].resolve({
        className: 'Other',
        diagnostics: [],
        graphs: [window.graphFor('other')],
      }),
    );
    await page.waitForFunction(() =>
      document.querySelector('#progress-probe .graph-status')?.textContent.includes(' · 100% · '),
    );
    assert.equal(await page.evaluate(() => window.layoutCalls), freshCalls + 1);
    await page.evaluate(() => window.progressPanel.update(window.freshDoc));
    await page.waitForFunction(
      () =>
        document.querySelector('#progress-probe .graph-method')?.textContent === 'fresh()V' &&
        !document.querySelector('#progress-probe .graph-method-progress'),
    );
    assert.equal(await page.locator('#progress-probe .graph-method-progress').count(), 0);
    assert.deepEqual(await page.locator('#progress-probe .graph-method').allTextContents(), [
      'fresh()V',
    ]);
    assert.equal(await page.evaluate(() => window.jobs.length), 3);
    assert.equal(await page.evaluate(() => window.layoutCalls), freshCalls + 1);
    await page.evaluate(() =>
      window.progressPanel.update({
        ...window.freshDoc,
        version: 3,
        source:
          'public class Fresh { public static fresh()V { return } public static added()V { return } }',
      }),
    );
    await page.waitForFunction(() => window.jobs.length === 4);
    await page.evaluate(() => {
      const unchanged = window.graphFor('fresh');
      unchanged.nodes[0].line = 9;
      window.jobs[3].resolve({
        className: 'Fresh',
        diagnostics: [],
        graphs: [unchanged, window.graphFor('added')],
      });
    });
    await page.waitForFunction(() =>
      document.querySelector('#progress-probe .graph-status')?.textContent.includes(' · 100% · '),
    );
    assert.equal(await page.evaluate(() => window.layoutCalls), freshCalls + 2);
    await page.locator('#progress-probe .graph-node rect').first().click();
    assert.equal(await page.evaluate(() => window.visitedLine), 9);
    await page.evaluate(() => window.progressPanel.dispose());
  },
);
