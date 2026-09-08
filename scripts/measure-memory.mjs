import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
// Windows/Edge audit. Run after pnpm run build, without concurrent browser tests.
// Heap samples force JS GC; WASM buffer capacity is not physical resident RAM.
await mkdir('.cache', { recursive: true });
const base = 'http://127.0.0.1:5223';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '5223',
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
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const cdp = await browser.newBrowserCDPSession();
  let nextId = 0;
  const pending = new Map();
  cdp.on('Target.receivedMessageFromTarget', (event) => {
    const message = JSON.parse(event.message),
      p = pending.get(message.id);
    if (p) {
      pending.delete(message.id);
      message.error
        ? p.reject(new Error(JSON.stringify(message.error)))
        : p.resolve(message.result);
    }
  });
  async function child(sessionId, method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch(reject);
    });
  }
  const records = [];
  async function snapshot(name) {
    const targets = (await cdp.send('Target.getTargets')).targetInfos.filter((t) =>
      ['page', 'worker'].includes(t.type),
    );
    const heaps = [];
    for (const target of targets) {
      const { sessionId } = await cdp.send('Target.attachToTarget', {
        targetId: target.targetId,
        flatten: false,
      });
      try {
        await child(sessionId, 'HeapProfiler.collectGarbage');
        const heap = await child(sessionId, 'Runtime.getHeapUsage');
        const proto = await child(sessionId, 'Runtime.evaluate', {
          expression: 'WebAssembly.Memory.prototype',
          objectGroup: 'memory-audit',
        });
        const objects = await child(sessionId, 'Runtime.queryObjects', {
          prototypeObjectId: proto.result.objectId,
          objectGroup: 'memory-audit',
        });
        const memory = await child(sessionId, 'Runtime.callFunctionOn', {
          objectId: objects.objects.objectId,
          functionDeclaration: 'function(){return Array.from(this,m=>m.buffer.byteLength)}',
          returnByValue: true,
        });
        heaps.push({
          type: target.type,
          url: target.url.split('/').at(-1),
          ...heap,
          wasmBytes: memory.result.value,
        });
        await child(sessionId, 'Runtime.releaseObjectGroup', { objectGroup: 'memory-audit' });
      } finally {
        await cdp.send('Target.detachFromTarget', { sessionId });
      }
    }
    const processes = (await cdp.send('SystemInfo.getProcessInfo')).processInfo;
    const ids = processes.map((p) => p.id).join(',');
    const os = JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `@(Get-Process -Id ${ids} -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,PrivateMemorySize64) | ConvertTo-Json -Compress`,
        ],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
    const record = { name, heaps, processes, os };
    records.push(record);
    console.log(
      name,
      'JS MiB',
      (heaps.reduce((n, h) => n + h.usedSize, 0) / 1048576).toFixed(1),
      'WASM MiB',
      (heaps.reduce((n, h) => n + h.wasmBytes.reduce((a, b) => a + b, 0), 0) / 1048576).toFixed(1),
    );
    await writeFile(
      process.argv[2] ?? '.cache/memory-optimized.json',
      JSON.stringify({ browser: browser.version(), records }, null, 2),
    );
  }
  await snapshot('blank');
  if (process.env.JALWEB_DEVICE_MEMORY)
    await page.addInitScript(
      (value) => Object.defineProperty(navigator, 'deviceMemory', { value }),
      Number(process.env.JALWEB_DEVICE_MEMORY),
    );
  await page.goto(base);
  await page.waitForFunction(
    () => document.querySelector('#state')?.textContent === '実行できます',
  );
  await snapshot('ready');
  await page.locator('#instructions-tab').click();
  await page.locator('.instruction-detail h2').waitFor();
  await page.locator('#graph-tab').click();
  await page.locator('.graph-node rect').first().waitFor();
  await snapshot('panels');
  async function edit(source) {
    await page.locator('#editor .view-lines').click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText(source);
    await page.waitForTimeout(1000);
    console.log('state', await page.locator('#state').textContent());
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
      null,
      { timeout: 15000 },
    );
  }
  await edit(
    'public class Main { public static main([Ljava/lang/String;)V { sipush 15000 i2l invokestatic java/lang/Thread->sleep(J)V return } }',
  );
  await page.locator('#run').click();
  await page.waitForTimeout(3000);
  await snapshot('running');
  await page.waitForFunction(
    () => document.querySelector('#state')?.textContent === '実行が完了しました',
  );
  await snapshot('finished');
  // Accelerate only the idle timer, without pending work, to keep the audit short.
  await page.evaluate(() => {
    const timer = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) =>
      timer(fn, ms === 30000 || ms === 60000 ? 10 : ms, ...args);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.setTimeout = timer;
  });
  await page.waitForTimeout(250);
  await snapshot('background-idle');
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const result = await page.evaluate(() =>
    window.jalwebDetached.compileUsage('public class Resumed { public static test()V { return } }'),
  );
  if (result.diagnostics.some((d) => d.severity === 'error'))
    throw new Error(JSON.stringify(result.diagnostics));
  await snapshot('resumed');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
