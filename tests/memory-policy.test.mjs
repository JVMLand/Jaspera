import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  stdin: {
    contents: "export * from './src/memory-policy';export * from './src/usage-compilation';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { memoryPolicy, usageCompiler } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
test('capacity hints select bounded heaps, with conservative defaults for missing or invalid values', () => {
  for (const memory of [0.25, 1, 2, 4]) assert.equal(memoryPolicy(memory).analysisHeapMiB, 32);
  for (const memory of [undefined, NaN, Infinity, -1, 0, 8, 16, 32, 1024])
    assert.deepEqual(memoryPolicy(memory), {
      analysisHeapMiB: 64,
      executionHeapMiB: 128,
      usageCacheEntries: 24,
      backgroundIdleMs: 60000,
    });
  assert.equal(memoryPolicy(4).executionHeapMiB, 64);
});
test('usage cache retains recent identities and evicts the least recently used source', () => {
  const calls = [],
    compile = usageCompiler(
      {
        compile: (doc, source) => {
          calls.push({ doc, source });
          return Promise.resolve({});
        },
      },
      2,
    );
  compile('a');
  compile('b');
  compile('a');
  compile('c');
  compile('b');
  assert.equal(calls[0].doc, calls[2].doc);
  assert.notEqual(calls[1].doc, calls[4].doc);
});
