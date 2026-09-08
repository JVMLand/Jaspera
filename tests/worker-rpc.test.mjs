import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'Comlink RPC handles concurrent results, transfers, failures, stop, timeout and restart',
  { timeout: 40000 },
  async (t) => {
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    const base = 'http://127.0.0.1:5196';
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
    const page = await newAppPage(browser);
    await page.goto(base + '/tests/harness.html');
    const result = await page.evaluate(async () => {
      const { WorkerRpc } = await import('/src/worker-rpc.ts');
      const rpc = new WorkerRpc(
        () => new Worker('/tests/rpc-fixture.worker.ts', { type: 'module' }),
      );
      const values = await Promise.all([
        rpc.call((api) => api.delay(1, 60)),
        rpc.call((api) => api.delay(2, 1)),
      ]);
      const bytes = Array.from(await rpc.call((api) => api.bytes()));
      const failure = await rpc.call((api) => api.fail()).catch((e) => e.message);
      const stopped = rpc.call((api) => api.delay(3, 1000)).catch((e) => e.message);
      rpc.stop('test stop');
      const restart = rpc.call((api) => api.delay(4, 1));
      const stop = await stopped,
        reused = await restart;
      const timeout = await rpc.call((api) => api.hang(), 100).catch((e) => e.message);
      const afterTimeout = await rpc.call((api) => api.delay(5, 1));
      const crash = await rpc.call((api) => api.crash()).catch((e) => e.message);
      const afterCrash = await rpc.call((api) => api.delay(6, 1));
      rpc.dispose();
      const disposed = await rpc.call((api) => api.delay(7, 1)).catch((e) => e.message);
      return {
        values,
        bytes,
        failure,
        stop,
        reused,
        timeout,
        afterTimeout,
        crash,
        afterCrash,
        disposed,
      };
    });
    assert.deepEqual(result.values, [1, 2]);
    assert.deepEqual(result.bytes, [1, 2, 3]);
    assert.equal(result.failure, 'fixture failure');
    assert.equal(result.stop, 'test stop');
    assert.equal(result.reused, 4);
    assert.match(result.timeout, /上限/);
    assert.equal(result.afterTimeout, 5);
    assert.match(result.crash, /fixture crash/);
    assert.equal(result.afterCrash, 6);
    assert.match(result.disposed, /終了/);
  },
);
