import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  entryPoints: ['src/search-ranking.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { searchTargets } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const string = { kind: 'class', label: 'String', detail: 'java.lang.String' };
const stringify = {
  kind: 'method',
  label: 'stringify()Ljava/lang/String;',
  detail: 'example.Helper',
};
const returnString = {
  kind: 'method',
  label: 'getName()Ljava/lang/String;',
  detail: 'example.Helper',
};
const stringLength = { kind: 'method', label: 'length()I', detail: 'java.lang.String' };
test('class definitions precede owner and descriptor matches, including qualified queries', () => {
  for (const query of ['String', 'java.lang.String', 'java/lang/String'])
    assert.equal(searchTargets([returnString, stringLength, stringify, string], query)[0], string);
  assert.ok(
    searchTargets([returnString, stringify, string], 'String').indexOf(stringify) <
      searchTargets([returnString, stringify, string], 'String').indexOf(returnString),
  );
});
test('member names rank ahead of other members mentioning that type', () => {
  const reference = { kind: 'method', label: 'make()Lexample/compute;', detail: 'example.Helper' },
    definition = { kind: 'method', label: 'compute(II)I', detail: 'example.Helper' };
  assert.equal(searchTargets([reference, definition], 'compute')[0], definition);
  assert.equal(searchTargets([reference, definition], 'Helper compute')[0], definition);
  const field = { kind: 'field', label: 'out:Ljava/io/PrintStream;', detail: 'java.lang.System' };
  assert.equal(
    searchTargets(
      [field, { kind: 'class', label: 'PrintStream', detail: 'java.io.PrintStream' }],
      'PrintStream',
    )[0].kind,
    'class',
  );
  assert.equal(searchTargets([field], 'System out')[0], field);
});
test('descriptor searches and file searches remain available', () => {
  assert.equal(searchTargets([returnString], 'getName()Ljava/lang/String;')[0], returnString);
  const file = { kind: 'file', label: 'Main.jal', detail: 'src/Main.jal' };
  assert.equal(searchTargets([string, file], 'Main.jal')[0], file);
  assert.deepEqual(searchTargets([string, file], 'absent'), []);
  assert.equal(searchTargets([string, file], '')[0], file);
});
