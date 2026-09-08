import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  entryPoints: ['src/file-labels.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { fileLabel, tabLabels } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const labels = (paths) => [
  ...tabLabels(paths.map((path, i) => ({ key: String(i), path }))).values(),
];
test('unique files use basenames without JAL extensions', () => {
  assert.deepEqual(labels(['src/Main.jal', 'src/a/Helper.jal']), ['Main', 'Helper']);
  assert.equal(fileLabel('src/Main.JAL'), 'Main');
  assert.equal(fileLabel('lib/Main.class'), 'Main.class');
});
test('only ambiguous suffixes grow, and root files terminate', () => {
  assert.deepEqual(
    labels([
      'src/a/common/Main.jal',
      'src/b/common/Main.jal',
      'src/c/other/Main.jal',
      'src/Unique.jal',
    ]),
    ['a/common/Main', 'b/common/Main', 'other/Main', 'Unique'],
  );
  assert.deepEqual(labels(['Main.jal', 'src/Main.jal']), ['Main', 'src/Main']);
  assert.deepEqual(labels(['src/Main.jal', 'src/Main.jal']), ['src/Main', 'src/Main']);
});
test('closing a duplicate returns the remaining title to its basename', () => {
  assert.deepEqual(labels(['src/a/Main.jal', 'src/b/Main.jal']), ['a/Main', 'b/Main']);
  assert.deepEqual(labels(['src/a/Main.jal']), ['Main']);
});
