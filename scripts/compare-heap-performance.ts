import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('.cache', { recursive: true });
const base = 'http://127.0.0.1:5225',
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5225', '--strictPort'],
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
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.route(base + '/', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Heap comparison</title>' }),
  );
  await page.goto(base);
  const results = [];
  for (const heap of [128, 64, 64, 128]) {
    const run = await page.evaluate(async (heap) => {
      const moduleUrl = '/src/runtime.ts';
      const { Runtime } = (await import(moduleUrl)) as {
          Runtime: new (heap: number) => {
            compile(source: string): Promise<{ diagnostics: { severity: string }[] }>;
            stop(): void;
          };
        },
        runtime = new Runtime(heap);
      try {
        await runtime.compile('public class Warm { public static x()V { return } }');
        const times = [];
        for (const n of [20, 200, 1000]) {
          const source =
            'public class Bench' +
            n +
            ' { public static main([Ljava/lang/String;)V {\n' +
            'nop\n'.repeat(n) +
            'return\n} }';
          const start = performance.now(),
            result = await runtime.compile(source);
          if (result.diagnostics.some((d) => d.severity === 'error'))
            throw new Error(JSON.stringify(result.diagnostics));
          times.push({ instructions: n + 1, ms: performance.now() - start });
        }
        return { heap, times };
      } finally {
        runtime.stop();
      }
    }, heap);
    results.push(run);
    console.log(JSON.stringify(run));
    await writeFile('.cache/heap-performance.json', JSON.stringify(results, null, 2));
  }
} finally {
  await browser?.close();
  server.kill();
}
