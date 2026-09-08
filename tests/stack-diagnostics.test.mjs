import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('.cache/stack-diagnostics', { recursive: true });
async function check(name, body, target, message, occurrence = 0) {
  const source = `public class Main {\n public static main([Ljava/lang/String;)V {\n  ${body}\n  return\n }\n}`,
    path = '.cache/stack-diagnostics/' + name + '.jal';
  await writeFile(path, source);
  const result = spawnSync(
    'java',
    ['-cp', 'public/runtime/jalweb-compiler.jar', 'jalweb.Bridge', path],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const compilation = JSON.parse(result.stdout.trim()),
    errors = compilation.diagnostics.filter((d) => d.severity === 'error');
  assert.equal(errors.length, 1, JSON.stringify(compilation));
  const error = errors[0];
  let offset = -1;
  for (let i = 0; i <= occurrence; i++) offset = source.indexOf(target, offset + 1);
  const before = source.slice(0, offset),
    line = before.split('\n').length,
    column = offset - before.lastIndexOf('\n');
  assert.equal(error.line, line);
  assert.equal(error.column, column);
  assert.equal(error.length, target.length);
  assert.match(error.message, message);
  assert.equal(compilation.bytecode, '');
}
test('invokevirtual points to the String parameter, not the producer or first line', () =>
  check(
    'invoke',
    'getstatic java/lang/System->out:Ljava/io/PrintStream;\n  invokestatic Helper->compute()I\n  invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V',
    'Ljava/lang/String;',
    /第1引数.*java\.lang\.String.*int/,
    1,
  ));
test('repeated parameter types select the exact argument on one line', () =>
  check(
    'repeated',
    'iconst_0 iconst_1 aconst_null invokestatic Helper->take(III)V',
    'I',
    /第3引数.*int.*null/,
    2,
  ));
test('array descriptors include the full element type', () =>
  check(
    'array',
    'iconst_0 invokestatic Helper->take([[Ljava/lang/String;)V',
    '[[Ljava/lang/String;',
    /第1引数.*java\.lang\.String\[\]\[\].*int/,
  ));
test('wide arguments use slot counts, not parameter counts', () =>
  check('wide', 'aconst_null lconst_0 invokestatic Helper->take(IJ)V', 'I', /第1引数.*int.*null/));
test('putstatic underlines the field descriptor', () =>
  check(
    'putstatic',
    'iconst_0 putstatic Helper->text:Ljava/lang/String;',
    'Ljava/lang/String;',
    /フィールドに代入する値.*java\.lang\.String.*int/,
    1,
  ));
test('putfield underlines the value type before checking the receiver', () =>
  check(
    'putfield',
    'aconst_null iconst_0 putfield Helper->text:Ljava/lang/String;',
    'Ljava/lang/String;',
    /フィールドに代入する値.*java\.lang\.String.*int/,
    1,
  ));
test('getfield receiver mismatches point to the owner', () =>
  check(
    'getfield',
    'iconst_0 getfield Helper->text:Ljava/lang/String;',
    'Helper',
    /参照先オブジェクト.*Helper.*int/,
  ));
test('ordinary stack mismatches underline the consuming opcode', () =>
  check('arithmetic', 'iconst_0 aconst_null iadd', 'iadd', /iadd.*int.*null/));
test('stack underflow points to the missing argument', () =>
  check('underflow', 'invokestatic Helper->take(I)V', 'I', /第1引数.*int.*スタックにありません/));

test('empty pop is reported without dereferencing an unfilled capsule', () =>
  check('pop', 'pop', 'pop', /pop.*スタックにありません/));
test('dup rejects category-2 values at the opcode', () =>
  check('dup', 'lconst_0 dup pop2 pop2', 'dup', /dup.*カテゴリ1.*long/));
