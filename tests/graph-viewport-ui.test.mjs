import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
test(
  'large graphs mount only the viewport and keep all methods accessible',
  { timeout: 60000 },
  async (t) => {
    const base = 'http://127.0.0.1:5232',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5232', '--strictPort'],
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
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(base + '/tests/harness.html');
    await page.evaluate(async () => {
      const { installInstructionGraph } = await import('/src/instruction-graph.ts'),
        { methodLayouts } = await import('/src/graph-cache.ts');
      const host = document.createElement('div');
      host.id = 'probe';
      host.style.cssText = 'width:800px;height:650px';
      document.body.append(host);
      const graphs = Array.from({ length: 60 }, (_, m) => ({
        name: 'method' + m + '()V',
        nodes: Array.from({ length: 60 }, (_, n) => ({
          id: 'n' + n,
          text: 'nop',
          opcode: 'nop',
          block: 'entry',
          line: m * 100 + n + 2,
          column: 1,
          consumed: 0,
          produced: 0,
          unreachable: false,
        })),
        edges: [],
      }));
      for (const graph of graphs)
        methodLayouts.set(graph, {
          width: graph === graphs.at(-1) ? 100000 : 500,
          height: 3080,
          boxes: [{ x: 0, y: 0, width: 500, height: 3080, name: graph.name }],
          nodes: graph.nodes.map((n, i) => ({
            ...n,
            id: 'm0:' + n.id,
            x: 250,
            y: 60 + i * 50,
            width: 150,
            height: 30,
          })),
          edges: [],
        });
      window.calls = 0;
      window.panel = installInstructionGraph(
        host,
        async () => {
          window.calls++;
          return { className: 'Large', bytecode: '', diagnostics: [], graphs };
        },
        (_, line) => (window.visited = line),
      );
      window.doc = {
        uri: 'inmemory://jal/Large.jal',
        source:
          'public class Large { ' +
          graphs.map((g) => 'public static ' + g.name + ' { return }').join(' ') +
          ' }',
        version: 1,
        line: 2,
        column: 1,
      };
      window.panel.update(window.doc);
    });
    await page.waitForFunction(() =>
      document.querySelector('.graph-status')?.textContent.includes(' · 100% · '),
    );
    await page.waitForFunction(() => document.querySelectorAll('.graph-node').length > 0);
    const before = await page.locator('.graph-node').count();
    assert.ok(before < 50, 'offscreen nodes must not remain mounted');
    assert.equal(await page.locator('.graph-method-group').count(), 60);
    const svg = page.locator('.graph-canvas'),
      box = await svg.boundingBox();
    await page.mouse.move(box.x + 20, box.y + box.height - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y - 6000, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.graph-method')].some((n) => n.textContent === 'method2()V'),
    );
    assert.ok((await page.locator('.graph-node').count()) < 60);
    assert.equal(await page.evaluate(() => window.calls), 1);
    await page.evaluate(() => window.panel.update({ ...window.doc, line: 210, column: 1 }));
    await page.waitForFunction(() => document.querySelector('.graph-node.selected'));
    await page.evaluate(() => window.panel.dispose());
    assert.equal(await page.locator('.graph-node').count(), 0);
  },
);
