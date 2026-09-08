import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
const bundle = await build({
  stdin: {
    contents:
      "export * from './src/estimated-size';export * from './src/source-documents';export * from './src/offline-cache';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { estimatedSize, SourceDocuments, offlineComplete, abortable, waitForWorker } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
test('size estimation neither serializes objects nor follows shared references twice; oversized arrays stop early', () => {
  const value = {
    text: 'x'.repeat(500),
    toJSON() {
      throw Error('must not serialize');
    },
  };
  const size = estimatedSize(value);
  assert.ok(size > 1000);
  const shared = estimatedSize([value, value]);
  assert.ok(shared < 2 * size);
  value.self = value;
  assert.ok(Number.isFinite(estimatedSize(value)));
  let visits = 0;
  const items = Array.from({ length: 100 }, () => ({
    get text() {
      visits++;
      return 'x'.repeat(500);
    },
  }));
  assert.ok(estimatedSize(items, 2000) > 2000);
  assert.ok(visits < 100);
});
function documentsFixture() {
  const project = {
    name: 'test',
    files: [],
    workspace: { entryFile: '', activeFile: '', views: {} },
  };
  const models = new Map(),
    closed = new Set(),
    groups = new Map(),
    results = new Map();
  let order = [];
  const removed = [],
    replaced = [];
  const store = new SourceDocuments({
    project: () => project,
    models,
    closed,
    groups,
    results,
    order: () => order,
    setOrder: (v) => (order = v),
    create(path, source) {
      const model = {
        source,
        getValue() {
          return this.source;
        },
        dispose() {
          this.disposed = true;
        },
      };
      models.set(path, model);
      return model;
    },
    removeView(key, model) {
      removed.push(key);
      assert.equal(model?.disposed, undefined);
      assert.equal(
        project.files.some((f) => 'source:' + f.path === key),
        false,
      );
    },
    replaceView(from, to, model, next) {
      replaced.push([from, to, next.getValue()]);
      assert.equal(model.disposed, undefined);
    },
  });
  return {
    store,
    project,
    models,
    closed,
    groups,
    results,
    removed,
    replaced,
    get order() {
      return order;
    },
    set order(v) {
      order = v;
    },
  };
}
test('deletion clears every document reference before disposing its model, including last-file deletion', () => {
  const f = documentsFixture(),
    model = f.store.add('a.jal', 'a');
  f.store.add('b.jal', 'b');
  f.project.workspace.activeFile = 'a.jal';
  f.project.workspace.views['a.jal'] = { line: 2 };
  f.closed.add('a.jal');
  f.groups.set('source:a.jal', 'left');
  f.results.set('a.jal', {});
  f.order = ['source:a.jal', 'panel:graph', 'source:b.jal'];
  f.store.remove('a.jal');
  assert.equal(model.disposed, true);
  assert.equal(f.models.has('a.jal'), false);
  assert.equal(f.closed.size, 0);
  assert.equal(f.groups.size, 0);
  assert.equal(f.results.size, 0);
  assert.deepEqual(f.project.workspace.views, {});
  assert.equal(f.project.workspace.entryFile, 'b.jal');
  assert.equal(f.project.workspace.activeFile, 'b.jal');
  assert.deepEqual(f.order, ['panel:graph', 'source:b.jal']);
  f.store.remove('b.jal');
  assert.equal(f.project.workspace.entryFile, '');
  assert.equal(f.project.workspace.activeFile, '');
});
test('rename transfers views and tab positions using the latest model text', () => {
  const f = documentsFixture(),
    model = f.store.add('a.jal', 'old');
  model.source = 'edited';
  f.project.workspace.activeFile = 'a.jal';
  f.project.workspace.views['a.jal'] = { line: 8 };
  f.closed.add('a.jal');
  f.groups.set('source:a.jal', 'left');
  f.order = ['panel:graph', 'source:a.jal'];
  f.store.rename('a.jal', 'b.jal');
  assert.deepEqual(f.project.files, [{ path: 'b.jal', source: 'edited' }]);
  assert.equal(f.project.workspace.entryFile, 'b.jal');
  assert.deepEqual(f.project.workspace.views, { 'b.jal': { line: 8 } });
  assert.equal(f.closed.has('b.jal'), true);
  assert.equal(f.groups.get('source:b.jal'), 'left');
  assert.deepEqual(f.order, ['panel:graph', 'source:b.jal']);
  assert.deepEqual(f.replaced, [['source:a.jal', 'source:b.jal', 'edited']]);
  assert.equal(model.disposed, true);
  assert.throws(() => f.store.add('b.jal', 'overwrite'));
  assert.equal(f.models.get('b.jal').getValue(), 'edited');
});
for (const cacheId of ['jaspera', 'jaspera-0123456789abcdef'])
  test(`offline readiness requires exact revisions in ${cacheId}`, async () => {
    const base = new URL('https://example.test/jaspera/');
    const manifest = {
      cacheId,
      entries: [
        { url: 'runtime.js', revision: 'new' },
        { url: 'assets/a-hash.js', revision: null },
      ],
    };
    const caches = new Map();
    const storage = {
      keys: async () => [...caches.keys()],
      open: async (n) => ({ match: async (url) => (caches.get(n).has(url) ? {} : undefined) }),
    };
    caches.set(
      'jaspera-old-precache-v2',
      new Set([
        'https://example.test/jaspera/runtime.js?__WB_REVISION__=new',
        'https://example.test/jaspera/assets/a-hash.js',
      ]),
    );
    assert.equal(await offlineComplete(storage, base, manifest), false);
    const entries = new Set([
      'https://example.test/jaspera/runtime.js?__WB_REVISION__=old',
      'https://example.test/jaspera/assets/a-hash.js',
    ]);
    caches.set(manifest.cacheId + '-precache-v2', entries);
    assert.equal(await offlineComplete(storage, base, manifest), false);
    entries.add('https://example.test/jaspera/runtime.js?__WB_REVISION__=new');
    assert.equal(await offlineComplete(storage, base, manifest), true);
    entries.delete('https://example.test/jaspera/assets/a-hash.js');
    assert.equal(await offlineComplete(storage, base, manifest), false);
  });
test('closing preparation interrupts pending API and worker waits', async () => {
  const controller = new AbortController(),
    worker = new EventTarget();
  worker.state = 'installing';
  const a = abortable(new Promise(() => {}), controller.signal),
    b = waitForWorker(worker, controller.signal);
  controller.abort(new Error('closed'));
  await assert.rejects(a, /closed/);
  await assert.rejects(b, /closed/);
  worker.state = 'installed';
  worker.dispatchEvent(new Event('statechange'));
  await assert.rejects(waitForWorker(worker, controller.signal), /closed/);
});
test('all locale keys and placeholders match, including every referenced UI message', async () => {
  const ja = JSON.parse(await readFile('src/locales/ja.json', 'utf8'));
  const walk = async (path) => {
    let texts = [];
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'locales')
        texts.push(...(await walk(path + '/' + entry.name)));
      else if (entry.isFile() && /\.(ts|js)$/.test(entry.name))
        texts.push(await readFile(path + '/' + entry.name, 'utf8'));
    }
    return texts;
  };
  for (const source of await walk('src'))
    for (const match of source.matchAll(/(?:msg|displayMessage|localizedMessage)\('([^']+)'[),]/g))
      assert.ok(match[1] in ja, match[1]);
  const slots = (value) => [...new Set(value.match(/\{\d+\}/g) ?? [])].sort();
  for (const lang of ['en', 'zh', 'es', 'it', 'fr', 'la']) {
    const catalog = JSON.parse(await readFile('src/locales/' + lang + '.json', 'utf8'));
    assert.deepEqual(Object.keys(catalog).sort(), Object.keys(ja).sort(), lang);
    for (const [key, value] of Object.entries(catalog)) {
      assert.deepEqual(slots(value), slots(ja[key]), lang + ': ' + key);
      assert.doesNotMatch(value, /[\u3040-\u30ff]/, lang + ': ' + key);
    }
  }
});
