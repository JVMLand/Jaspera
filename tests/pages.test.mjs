import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/runtime-download.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const { fetchRuntimeFile } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
);

test('JDK download decompresses static gzip and preserves fetch options', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const bytes = Buffer.from('JDK bytes: 譌･譛ｬ隱杤0');
  const init = { cache: 'no-cache', signal: new AbortController().signal };
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://example.test/runtime/jdk23/lib/modules.gzip?v=1');
    assert.equal(options, init);
    return new Response(gzipSync(bytes));
  };
  assert.deepEqual(
    Buffer.from(
      await (
        await fetchRuntimeFile('https://example.test/runtime/jdk23/lib/modules?v=1', init)
      ).arrayBuffer(),
    ),
    bytes,
  );
  const response = new Response('ordinary asset');
  globalThis.fetch = async (url) => {
    assert.equal(url, 'https://example.test/runtime/bovine.js');
    return response;
  };
  assert.equal(await fetchRuntimeFile('https://example.test/runtime/bovine.js'), response);
  globalThis.fetch = async () => new Response('missing', { status: 404 });
  await assert.rejects(fetchRuntimeFile('https://example.test/runtime/jdk23/lib/modules'), /404/);
  globalThis.fetch = async () => new Response('not gzip');
  await assert.rejects(async () =>
    (await fetchRuntimeFile('https://example.test/runtime/jdk23/lib/modules')).arrayBuffer(),
  );
});

test('Pages output contains only static assets below the upload limits', async () => {
  let count = 0;
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) {
        await walk(path);
        continue;
      }
      count++;
      assert.ok((await stat(path)).size <= 25 * 1024 * 1024, path);
      assert.notEqual(item.name, '_worker.js');
    }
  }
  await walk('dist');
  assert.ok(count <= 20000);
  await assert.rejects(stat('dist/runtime/jdk23/lib/modules'), { code: 'ENOENT' });
  const compressed = await readFile('dist/runtime/jdk23/lib/modules.gzip');
  assert.deepEqual(gunzipSync(compressed), await readFile('public/runtime/jdk23/lib/modules'));
  const manifest = JSON.parse(await readFile('dist/offline-manifest.json', 'utf8'));
  assert.ok(manifest.urls.includes('runtime/jdk23/lib/modules.gzip'));
  for (const path of ['runtime/jdk23/lib/modules', '_headers', '_redirects'])
    assert.ok(!manifest.urls.includes(path));
  const config = JSON.parse((await readFile('wrangler.jsonc', 'utf8')).replace(/,\s*}/g, '}'));
  assert.equal(config.pages_build_output_dir, './dist');
  assert.equal(config.main, undefined);
  await assert.rejects(stat('functions'), { code: 'ENOENT' });
});
