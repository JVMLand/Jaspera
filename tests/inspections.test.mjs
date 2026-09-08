import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const b = await build({
  entryPoints: ['src/inspections.js'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
});
const { inspectSource } = await import(
  'data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64')
);
const wrap = (body, type = 'V') =>
  'public class Test { public static a()' + type + ' {\n' + body + '\n} }';
const inspect = (body) => inspectSource(wrap(body));
const fixed = (source, issue) => {
  for (const e of [...issue.edits].sort((a, b) => b.start - a.start))
    source = source.slice(0, e.start) + e.text + source.slice(e.end);
  return source;
};
test('constant boundaries and integer types', () => {
  for (const [input, title] of [
    ['bipush -1', 'iconst_m1'],
    ['bipush 0', 'iconst_0'],
    ['bipush 5', 'iconst_5'],
    ['sipush 127', 'bipush 127'],
    ['ldc -128', 'bipush -128'],
    ['ldc 32767', 'sipush 32767'],
    ['bipush 128', 'sipush 128'],
    ['sipush 32768', 'ldc 32768'],
    ['bipush 0x5', 'iconst_5'],
  ])
    assert.equal(inspect(input)[0]?.title, title + ' に変更', input);
  for (const input of [
    'bipush 6',
    'bipush -128',
    'sipush 128',
    'sipush -32768',
    'ldc 32768',
    'ldc 1L',
    'ldc 1.0',
    'ldc -0.0',
    'ldc 1f',
    'ldc 2147483648',
    'ldc "bipush 1"',
  ])
    assert.deepEqual(inspect(input), [], input);
});
test('local shortcuts, negative and slot limits', () => {
  assert.equal(inspect('aload 0')[0].title, 'aload_0 に変更');
  assert.equal(inspect('wide lstore 3')[0].title, 'lstore_3 に変更');
  for (const input of ['iload -1', 'iload 65535', 'lload 65534'])
    assert.equal(inspect(input)[0].code, 'local-range');
  assert.equal(inspect('iload 256')[0].code, 'missing-wide');
  assert.deepEqual(inspect('wide iload 65534'), []);
});
test('wide iinc accounts for increment as well as index', () => {
  for (const input of ['wide iinc 1 128', 'wide iinc 256 1', 'wide iinc 0 -129'])
    assert.deepEqual(inspect(input), []);
  assert.equal(inspect('iinc 0 128')[0].code, 'missing-wide');
  assert.equal(inspect('wide iinc 255 -128')[0].code, 'extra-wide');
  assert.equal(inspect('wide iinc 0 32768')[0].code, 'increment-range');
});
test('fixes preserve comments, labels and CRLF and remove only parser tokens', () => {
  const source = wrap('entry: wide iload /* index */ 0 // keep\r\nreturn');
  const item = inspectSource(source)[0];
  const output = fixed(source, item);
  assert.match(output, /entry:  iload_0 \/\* index \*\/  \/\/ keep\r\n/);
  assert.equal(
    inspectSource(output).some((i) => i.code === 'short-local'),
    false,
  );
  assert.deepEqual(inspect('/* bipush 1 */\nldc "iload 0"'), []);
});
test('return checks cover primitive arrays and boolean; labels stop unreachable warnings', () => {
  assert.deepEqual(inspectSource(wrap('aconst_null\nareturn', '[I')), []);
  assert.deepEqual(inspectSource(wrap('iconst_0\nireturn', 'Z')), []);
  assert.equal(inspectSource(wrap('return', 'I'))[0].code, 'return-type');
  assert.equal(inspect('return\nnop\nnext: nop').filter((i) => i.code === 'unreachable').length, 1);
});
test('incomplete source and macro operands never receive inferred replacements', () => {
  assert.deepEqual(inspect('bipush'), []);
  assert.deepEqual(inspect('bipush VALUE'), []);
  const source = '#define VALUE 1\n' + wrap('bipush VALUE');
  assert.equal(
    inspectSource(source).some((i) => i.edits),
    false,
  );
});
