import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { launchBrowser } from './helpers/browser.mjs';

test(
  'saved build detects, defers and downloads a release, then activates after closing',
  { timeout: 120000 },
  async (t) => {
    await mkdir('.cache', { recursive: true });
    const root = await mkdtemp(resolve('.cache/offline-update-test-'));
    const dist = join(root, 'dist');
    await mkdir(dist);
    await build({
      stdin: {
        contents: `import { initializeOfflineUpdates } from './src/offline-updates';
        import { openOfflinePreparation } from './src/offline';
        document.querySelector('#prepare').onclick = () => openOfflinePreparation();
        initializeOfflineUpdates();`,
        resolveDir: resolve('.'),
      },
      bundle: true,
      format: 'esm',
      outfile: join(dist, 'app.js'),
      define: { 'import.meta.env.PROD': 'true', 'import.meta.env.BASE_URL': '"/"' },
    });
    await writeFile(
      join(dist, 'index.html'),
      '<button id="prepare">Prepare</button><script type="module" src="/app.js"></script>',
    );
    const publish = async (value) => {
      await writeFile(join(dist, 'payload.txt'), value);
      await promisify(execFile)(
        process.execPath,
        [resolve('node_modules/tsx/dist/cli.mjs'), resolve('scripts/build-offline.ts')],
        { cwd: root, windowsHide: true },
      );
    };
    await publish('old');
    let probes = 0,
      failProbe = false;
    const server = createServer(async (req, res) => {
      const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
      if (name === 'activation-check') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Activation check</title>');
        return;
      }
      if (name === 'offline-update.json') {
        probes++;
        if (failProbe) {
          res.writeHead(503).end();
          return;
        }
      }
      try {
        const data = await readFile(join(dist, name));
        res.writeHead(200, {
          'Content-Type': name.endsWith('.js')
            ? 'text/javascript'
            : name.endsWith('.json')
              ? 'application/json'
              : name.endsWith('.html')
                ? 'text/html'
                : 'text/plain',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(() => new Promise((r) => server.close(r)));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    assert.equal(probes, 0, 'unprepared users do not check or download updates');
    await page.locator('#prepare').click();
    await page.locator('.offline-start').click();
    await page.waitForFunction(() =>
      document.querySelector('.offline-status')?.textContent.includes('保存が完了'),
    );
    await page.locator('.offline-close').click();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(async () => {
      await fetch('/payload.txt');
    });
    assert.equal(await page.locator('#offline-update').count(), 0);

    await context.setOffline(true);
    await page.reload();
    assert.equal(await page.evaluate(async () => (await fetch('/payload.txt')).text()), 'old');
    assert.equal(await page.locator('#offline-update').count(), 0);
    await publish('new');
    // A failed check must be silent, and a later reconnection must retry.
    failProbe = true;
    let checked = page.waitForResponse((r) => r.url().endsWith('/offline-update.json'));
    await context.setOffline(false);
    await checked;
    assert.equal(await page.locator('#offline-update').count(), 0);
    failProbe = false;
    await page.evaluate(() => {
      const d = document.createElement('dialog');
      d.id = 'busy';
      document.body.append(d);
      d.showModal();
    });
    checked = page.waitForResponse((r) => r.url().endsWith('/offline-update.json'));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await checked;
    assert.equal(await page.locator('#offline-update').count(), 0, 'do not cover another dialog');
    await page.evaluate(() => document.querySelector('#busy').close());
    await page.locator('#offline-update').waitFor();
    await page.getByRole('button', { name: 'あとで', exact: true }).click();
    checked = page.waitForResponse((r) => r.url().endsWith('/offline-update.json'));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await checked;
    assert.equal(
      await page.locator('#offline-update').count(),
      0,
      'same release only prompts once per session',
    );

    // Reload still serves the old build while the updated worker waits.
    await page.reload();
    await page.locator('#offline-update').waitFor();
    assert.equal(await page.evaluate(async () => (await fetch('/payload.txt')).text()), 'old');
    await page.locator('.offline-update-save').click();
    await page.waitForFunction(() =>
      document.querySelector('.offline-status')?.textContent.includes('タブと小窓をすべて閉じて'),
    );
    assert.equal(
      await page.evaluate(async () => (await fetch('/payload.txt')).text()),
      'old',
      'saving does not force activation',
    );
    await page.close();
    const reopened = await context.newPage();
    // Wait for activation with no app clients before navigating back.
    await reopened.goto(base + 'activation-check');
    await reopened.waitForFunction(
      async () => !(await navigator.serviceWorker.getRegistration())?.waiting,
    );
    await reopened.goto(base);
    assert.equal(await reopened.evaluate(async () => (await fetch('/payload.txt')).text()), 'new');
    await context.setOffline(true);
    await reopened.reload();
    assert.equal(await reopened.evaluate(async () => (await fetch('/payload.txt')).text()), 'new');
    assert.equal(await reopened.locator('#offline-update').count(), 0);
    assert.deepEqual(errors, []);
  },
);
