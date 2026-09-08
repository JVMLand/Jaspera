import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, brotliCompressSync, gunzipSync, brotliDecompressSync } from 'node:zlib';
import { selectEncoding, createHandler } from '../cloudflare/handler.mjs';

test('encoding negotiation respects exclusions, weights and identity', () => {
  for (const [input, expected] of [
    [null, 'identity'],
    ['gzip, br', 'br'],
    ['br;q=0,gzip', 'gzip'],
    ['br;q=0.4,gzip;q=0.8', 'gzip'],
    ['*;q=0', 'invalid'],
    ['gzip;q=0,br;q=0', 'identity'],
    ['br,identity;q=0', 'br'],
    ['br;q=0.1,identity;q=1', 'identity'],
    ['br;q=garbage,gzip', 'gzip'],
  ])
    assert.equal(selectEncoding(input), expected === 'invalid' ? null : expected);
});
test('subpath handler preserves bytes, origin, cache validators and service-worker scope', async () => {
  const bytes = Buffer.from('Jaspera\0こんにちは'.repeat(1000));
  const manifest = {
    '/jaspera/index.html': { hash: 'home', type: 'text/html', path: 'jaspera/index.html' },
    '/jaspera/sw.js': { hash: 'sw', type: 'text/javascript', path: 'jaspera/sw.js' },
    '/jaspera/runtime/modules': {
      hash: 'modules',
      type: 'application/octet-stream',
      encodings: { br: '.packed/modules.br', gzip: '.packed/modules.gz' },
    },
  };
  const calls = [];
  const env = {
    ASSETS: {
      fetch: async (req) => {
        calls.push(req);
        const p = new URL(req.url).pathname;
        return new Response(
          p.endsWith('.br')
            ? brotliCompressSync(bytes)
            : p.endsWith('.gz')
              ? gzipSync(bytes)
              : 'file',
        );
      },
    },
  };
  const run = createHandler(
    manifest,
    async (req) => new Response('GitHub ' + new URL(req.url).pathname),
  );
  for (const p of ['/', '/other', '/jasperax'])
    assert.match(await (await run(new Request('https://jal.yamad.jp' + p), env)).text(), /^GitHub/);
  const redirect = await run(new Request('https://jal.yamad.jp/jaspera?x=1'), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('Location'), 'https://jal.yamad.jp/jaspera/?x=1');
  for (const [accept, encoding] of [
    ['br,gzip', 'br'],
    ['br;q=0,gzip', 'gzip'],
    ['identity', 'identity'],
  ]) {
    const response = await run(
      new Request('https://jal.yamad.jp/jaspera/runtime/modules?revision=x', {
        headers: { 'Accept-Encoding': accept, Range: 'bytes=0-10' },
      }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Vary'), 'Accept-Encoding');
    const body = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(
      encoding === 'br'
        ? brotliDecompressSync(body)
        : encoding === 'gzip'
          ? gunzipSync(body)
          : body,
      bytes,
    );
    assert.equal(
      response.headers.get('Content-Encoding'),
      encoding === 'identity' ? null : encoding,
    );
    assert.equal(calls.at(-1).headers.get('Range'), null);
  }
  const before = calls.length;
  assert.equal(
    (
      await run(
        new Request('https://jal.yamad.jp/jaspera/runtime/modules', {
          headers: { 'If-None-Match': 'W/"modules"', 'Accept-Encoding': 'br' },
        }),
        env,
      )
    ).status,
    304,
  );
  const head = await run(
    new Request('https://jal.yamad.jp/jaspera/runtime/modules', {
      method: 'HEAD',
      headers: { 'Accept-Encoding': 'br' },
    }),
    env,
  );
  assert.equal(await head.text(), '');
  assert.equal(calls.length, before);
  assert.equal(
    (
      await run(
        new Request('https://jal.yamad.jp/jaspera/runtime/modules', {
          headers: { 'Accept-Encoding': '*;q=0' },
        }),
        env,
      )
    ).status,
    406,
  );
  assert.equal(
    (await run(new Request('https://jal.yamad.jp/jaspera/missing.js'), env)).status,
    404,
  );
  assert.equal(
    (await run(new Request('https://jal.yamad.jp/jaspera/.packed/modules.br'), env)).status,
    404,
  );
  assert.equal(
    (await run(new Request('https://jal.yamad.jp/jaspera/', { method: 'POST' }), env)).status,
    405,
  );
  assert.equal(
    (await run(new Request('https://jal.yamad.jp/jaspera/sw.js'), env)).headers.get(
      'Service-Worker-Allowed',
    ),
    '/jaspera/',
  );
});

test('Cloudflare original client encoding takes precedence over normalized header', async () => {
  const handler = createHandler({
    '/jaspera/test': {
      hash: 'test',
      type: 'application/octet-stream',
      encodings: { br: 'test.br', gzip: 'test.gz' },
    },
  });
  for (const [original, expected] of [
    ['gzip', 'gzip'],
    ['identity', null],
    ['', null],
  ]) {
    const request = new Request('https://jal.yamad.jp/jaspera/test', {
      method: 'HEAD',
      headers: { 'Accept-Encoding': 'br,gzip' },
    });
    Object.defineProperty(request, 'cf', { value: { clientAcceptEncoding: original } });
    const response = await handler(request, {});
    assert.equal(response.headers.get('Content-Encoding'), expected);
  }
});
