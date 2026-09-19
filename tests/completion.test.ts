import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const compiled = await build({
  entryPoints: ['src/completion.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { completeOperand, consoleCompletions } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const catalog = JSON.parse(await readFile('src/generated/jdk.json', 'utf8'));
test('member completion works before specifying an owner and respects opcode kind/staticness', () => {
  const fields = completeOperand('getstatic', '', catalog);
  assert.ok(fields.some((c) => c.insertText === 'java/lang/System->out:Ljava/io/PrintStream;'));
  assert.ok(fields.filter((c) => c.kind !== 'class').every((c) => c.kind === 'field'));
  const methods = completeOperand('invokevirtual', 'print', catalog);
  assert.ok(
    methods.some((c) => c.insertText === 'java/io/PrintStream->println(Ljava/lang/String;)V'),
  );
  assert.ok(!completeOperand('invokestatic', 'System.out.println', catalog).length);
  assert.ok(
    !completeOperand('getfield', 'System.out', catalog).some(
      (c) => c.insertText === 'java/lang/System->out:Ljava/io/PrintStream;',
    ),
  );
  assert.ok(
    completeOperand('invokespecial', 'Object.<init>', catalog).some(
      (c) => c.insertText === 'java/lang/Object-><init>()V',
    ),
  );
});
test('Java dot notation, short owner names and JAL notation produce canonical operands', () => {
  for (const q of ['java.lang.System.out', 'System.out', 'java/lang/System->out'])
    assert.ok(
      completeOperand('getstatic', q, catalog).some(
        (c) => c.insertText === 'java/lang/System->out:Ljava/io/PrintStream;',
      ),
    );
  for (const q of [
    'print',
    'System.out.println',
    'java.lang.System.out.println',
    'PrintStream.println',
    'java/io/PrintStream->println',
  ])
    assert.ok(
      completeOperand('invokevirtual', q, catalog).some(
        (c) => c.insertText === 'java/io/PrintStream->println(Ljava/lang/String;)V',
      ),
    );
  assert.ok(
    completeOperand('invokestatic', 'Math.abs', catalog).some(
      (c) => c.insertText === 'java/lang/Math->abs(I)I',
    ),
  );
  assert.ok(
    completeOperand('new', 'java.lang.StringB', catalog).some(
      (c) => c.insertText === 'java/lang/StringBuilder',
    ),
  );
});
test('print aliases expand into explicit, stack-balanced JAL snippets', () => {
  for (const q of ['print', 'println', 'System.out.println', 'java.lang.System.out.println']) {
    const candidates = consoleCompletions(q);
    assert.ok(candidates.length);
    assert.ok(
      candidates.every(
        (c) =>
          c.insertText.startsWith('getstatic ') &&
          c.insertText.includes('ldc "${1:Hello, World!}"') &&
          c.insertText.includes('invokevirtual java/io/PrintStream->'),
      ),
    );
  }
  assert.equal(
    consoleCompletions('java.lang.System.err.print')[0].insertText.includes('System->err:'),
    true,
  );
  assert.equal(consoleCompletions('somethingElse').length, 0);
});
