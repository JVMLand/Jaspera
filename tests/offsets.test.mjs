import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const b = await build({
  entryPoints: ['src/offsets.js'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
});
const { calculateOffsets } = await import(
  'data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64')
);
const wrap = (body) =>
  'public class Test { public static main([Ljava/lang/String;)V {\n' + body + '\n} }';
const offsets = (body) => calculateOffsets(wrap(body)).map((i) => i.offset);
test('source offsets are independent of compilation and stack validity', () => {
  assert.deepEqual(
    offsets(
      'getstatic java/lang/System->out:Ljava/io/PrintStream;\nldc "Hello"\ninvokevirtual java/io/PrintStream->println(Ljava/lang/String;)V\nreturn',
    ),
    [0, 3, 5, 8],
  );
  assert.deepEqual(offsets('pop\nbipush 2\nsipush 300\nreturn'), [0, 1, 3, 6]);
});
test('wide and aligned variable-length switches follow Javasm sizes', () => {
  assert.deepEqual(offsets('wide iload 256\nwide iinc 256 300\nreturn'), [0, 4, 10]);
  assert.deepEqual(
    offsets('iconst_0\ntableswitch 0 { a, b } default c\na: return\nb: return\nc: return'),
    [0, 1, 24, 25, 26],
  );
  assert.deepEqual(
    offsets('iconst_0\nlookupswitch { 1: a, 9: b, default: c }\na: return\nb: return\nc: return'),
    [0, 1, 28, 29, 30],
  );
});
test('method offsets reset; comments and strings do not become instructions', () => {
  const source =
    'public class Test { public static a()V { ldc "nop return"\n/* sipush 99 */ pop\nreturn } public static b()V { return } }';
  assert.deepEqual(
    calculateOffsets(source).map((i) => i.offset),
    [0, 2, 3, 0],
  );
});
test('multiline object macros map offsets back to the invocation line', async () => {
  const result = calculateOffsets(await readFile('tests/fixtures/MultiLineDefine.jal', 'utf8'));
  assert.deepEqual(
    result.filter((i) => i.line === 16).map((i) => i.offset),
    [0, 3, 5],
  );
  assert.equal(result.at(-1).offset, 17);
});
test('incomplete operand stops later offsets instead of showing stale estimates', () => {
  assert.deepEqual(offsets('nop\nsipush\nreturn'), [0, 1]);
  assert.deepEqual(offsets('nop\nunknown_macro\nreturn'), [0]);
});

test('class literal operands retain source offsets', () => {
  assert.deepEqual(offsets('ldc Ljava/lang/String;\npop\nldc_w [I\npop\nreturn'), [0, 2, 3, 6, 7]);
});
