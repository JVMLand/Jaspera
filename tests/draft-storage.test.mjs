import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built = await build({
  entryPoints: ['src/draft-storage.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { draftKey, readDraft, draftWriter } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
const draft = {
  version: 1,
  dirty: true,
  examples: { 'example/HelloWorld.jal': 'edited' },
  project: {
    name: 'Main',
    files: [{ path: 'src/Main.jal', source: 'x'.repeat(1024 * 1024 + 1) }],
    workspace: {
      activeFile: 'src/Main.jal',
      entryFile: 'src/Main.jal',
      stdin: '',
      panel: 'console',
      wordWrap: false,
      views: {},
    },
  },
};
test('draft round trips large edited sources and examples without import size limits', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(readDraft(storage), undefined);
  assert.equal(
    draftWriter(
      () => storage,
      () => assert.fail('save failed'),
    )(draft),
    true,
  );
  assert.equal(readDraft(storage).project.files[0].source, draft.project.files[0].source);
  assert.deepEqual(readDraft(storage).examples, draft.examples);
  values.set(draftKey, '{');
  assert.throws(() => readDraft(storage));
});
test('quota or access failures preserve prior draft and notify once until recovery', () => {
  let previous = 'previous',
    fail = true,
    errors = 0;
  const write = draftWriter(
    () => ({
      setItem: (_, value) => {
        if (fail) throw new Error('quota');
        previous = value;
      },
    }),
    () => errors++,
  );
  assert.equal(write(draft), false);
  write(draft);
  assert.equal(errors, 1);
  assert.equal(previous, 'previous');
  fail = false;
  assert.equal(write(draft), true);
  fail = true;
  write(draft);
  assert.equal(errors, 2);
});
