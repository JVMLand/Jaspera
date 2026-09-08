import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
const port = Number(process.env.PERF_PORT ?? 5235),
  base = `http://127.0.0.1:${port}`,
  output = process.env.PERF_OUTPUT ?? process.argv[2] ?? '.cache/performance/latest.json';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { stdio: 'pipe', windowsHide: true },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    channel: process.env.JALWEB_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('jalweb.theme', 'vs-dark'));
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const report = {
    schema: 1,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    date: new Date().toISOString(),
    browser: browser.version(),
    profile: 'local preview',
    timings: {} as Record<string, number>,
    memory: [] as {
      label: string;
      rendererHeapBytes: number;
      rendererBackingStorageBytes: number | null;
      documents: number;
      nodes: number;
      jsEventListeners: number;
      workers: number;
    }[],
    visibleGraphNodes: 0,
    reopenGraphSamples: [] as number[],
    environment: {} as {
      deviceMemoryGiB: number | null;
      hardwareConcurrency: number;
      userAgent: string;
    },
    ratios: {} as Record<string, number>,
    notes: [
      'Renderer JS heap excludes JVM/WASM worker memory and is not total application RAM.',
      'Heap samples force GC to make retained renderer state comparable.',
      'Use the same machine, browser and build mode when comparing reports.',
    ],
  };
  async function timed<T>(name: string, work: () => Promise<T>) {
    const start = performance.now();
    const value = await work();
    report.timings[name] = Math.round(performance.now() - start);
    console.log(name + ': ' + report.timings[name] + ' ms');
    return value;
  }
  async function sample(label: string) {
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage'),
      dom = await cdp.send('Memory.getDOMCounters');
    report.memory.push({
      label,
      rendererHeapBytes: heap.usedSize,
      rendererBackingStorageBytes: heap.backingStorageSize ?? null,
      ...dom,
      workers: page.workers().length,
    });
  }
  await timed('coldStartup', async () => {
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 600000 },
    );
  });
  await timed('firstExecution', async () => {
    await page.locator('#run').click();
    await page.waitForFunction(() =>
      document.querySelector('#output')?.textContent?.includes('Hello, World!'),
    );
  });
  await page.waitForFunction(() => document.querySelector('#run')?.textContent?.includes('Run'));
  await sample('startup');
  async function openClass() {
    await page.keyboard.press('Shift');
    await page.keyboard.press('Shift');
    const dialog = page.getByRole('dialog', { name: 'どこでも検索' });
    await dialog.getByRole('combobox').fill('java.io.PrintStream');
    await dialog
      .getByRole('option')
      .filter({ has: page.locator('strong', { hasText: /^PrintStream$/ }) })
      .first()
      .click();
    await dialog.waitFor({ state: 'hidden' });
  }
  await timed('openPrintStream', openClass);
  await timed('firstGraph', async () => {
    await page.locator('#graph-tab').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#graph-panel .graph-status')?.textContent?.includes(' · 100% · ') &&
        document
          .querySelector('#graph-panel .graph-status')
          ?.textContent?.includes('java/io/PrintStream') &&
        document.querySelectorAll('#graph-panel .graph-node').length > 0,
    );
  });
  report.visibleGraphNodes = await page.locator('#graph-panel .graph-node').count();
  await sample('graphWarm');
  const repetitions = [];
  for (let i = 0; i < 10; i++) {
    await page
      .locator('[data-pane-key^="preview:definition:java/io/PrintStream"] .tab-close')
      .click();
    const start = performance.now();
    await openClass();
    await page.waitForFunction(
      () =>
        document.querySelector('#graph-panel .graph-status')?.textContent?.includes(' · 100% · ') &&
        document
          .querySelector('#graph-panel .graph-status')
          ?.textContent?.includes('java/io/PrintStream') &&
        document.querySelectorAll('#graph-panel .graph-node').length > 0,
    );
    repetitions.push(Math.round(performance.now() - start));
    console.log('reopen ' + (i + 1) + ': ' + repetitions.at(-1) + ' ms');
  }
  const sorted = [...repetitions].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  report.timings.reopenGraphMedian =
    sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  report.reopenGraphSamples = repetitions;
  await sample('after10Reopens');
  await page
    .locator('[data-pane-key^="preview:definition:java/io/PrintStream"] .tab-close')
    .click();
  await page.locator('#editor .view-lines').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await timed('opcodeCompletion', async () => {
    await page.keyboard.press('Control+Space');
    await page.locator('.suggest-widget.visible').first().waitFor();
  });
  await page.keyboard.press('Escape');
  report.environment = await page.evaluate(() => ({
    deviceMemoryGiB: navigator.deviceMemory ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency,
    userAgent: navigator.userAgent,
  }));
  if (process.env.PERF_BASELINE) {
    const baseline = JSON.parse(await readFile(process.env.PERF_BASELINE, 'utf8'));
    report.ratios = Object.fromEntries(
      Object.entries(report.timings)
        .filter(([key]) => baseline.timings[key] > 0)
        .map(([key, value]) => [key, Number((value / baseline.timings[key]).toFixed(2))]),
    );
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('Saved ' + output);
} finally {
  await browser?.close();
  server.kill();
}
