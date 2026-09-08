import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const bundle = await build({
  stdin: {
    contents: `export {analyzeSource} from './src/source-analysis-core.js';export {parseJal} from './src/jal-parse.js';export {parameterSlots} from './src/parameter-slots.js';export {calculateOffsets} from './src/offsets.js';export {inspectSource} from './src/inspections.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
});
const { analyzeSource, parseJal, parameterSlots, calculateOffsets, inspectSource } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const separate = (source) => ({
  parameters: parameterSlots(source),
  offsets: calculateOffsets(source),
  inspections: inspectSource(source),
});
const ordinary = 'public class Main {\n public static calc(IJ)V {\n bipush 1\n pop\n return\n }\n}';
for (const [name, source, count] of [
  ['ordinary', ordinary, 1],
  ['CRLF and Unicode', '// 😀 日本語\r\n' + ordinary.replaceAll('\n', '\r\n'), 1],
  ['incomplete instruction', ordinary.replace('bipush 1', 'bipush ?'), 1],
  ['macro', await readFile('tests/fixtures/MultiLineDefine.jal', 'utf8'), 2],
  ['size limit', ' '.repeat(1024 * 1024 + 1), 0],
])
  test(name + ' shares only identical parser inputs and preserves results', () => {
    let calls = 0;
    const result = analyzeSource(source, (text) => {
      calls++;
      return parseJal(text);
    });
    assert.deepEqual(result, separate(source));
    assert.equal(calls, count);
  });
test('snapshots do not survive an edit or another request', () => {
  let calls = 0;
  const parse = (text) => {
    calls++;
    return parseJal(text);
  };
  analyzeSource(ordinary, parse);
  const changed = analyzeSource(ordinary.replace('bipush 1', 'bipush 100'), parse);
  assert.equal(calls, 2);
  assert.equal(changed.inspections.length, 0);
});

test('fast prediction preserves the recovered LL tree, tokens and error locations', async () => {
  for (const source of [
    ordinary,
    ordinary.replace('bipush 1', 'bipush'),
    ordinary.replace('calc(IJ)V', 'calc(I'),
    ordinary.replace('bipush 1', 'bipush ?'),
    await readFile('tests/fixtures/MultiLineDefine.jal', 'utf8'),
  ]) {
    const fast = parseJal(source),
      slow = parseJal(source, false);
    assert.equal(
      fast.root.toStringTree(null, fast.root.parser),
      slow.root.toStringTree(null, slow.root.parser),
    );
    assert.deepEqual(fast.errors, slow.errors);
  }
});
