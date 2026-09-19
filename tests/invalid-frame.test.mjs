import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

for (const [name, code, required, missing] of [
  [
    'receiver-only',
    'getstatic java/lang/System->out:Ljava/io/PrintStream;\n invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V',
    ['java.io.PrintStream', 'java.lang.String'],
    1,
  ],
  [
    'empty',
    'invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V',
    ['java.io.PrintStream', 'java.lang.String'],
    2,
  ],
  ['wide', 'lconst_0\n invokestatic Helper->take(JD)V', ['long', 'double'], 1],
  ['wrong-type', 'aconst_null\n invokestatic Helper->take(I)V', ['int'], 0],
])
  test(`${name}: invalid call retains input without fabricating output`, async () => {
    await mkdir('.cache/invalid-frame', { recursive: true });
    const path = `.cache/invalid-frame/${name}.jal`;
    await writeFile(
      path,
      `public class Main { public static main([Ljava/lang/String;)V {\n ${code}\n return\n } }`,
    );
    const run = spawnSync(
      'java',
      ['-cp', 'public/runtime/jalweb-compiler.jar', 'jalweb.Bridge', path],
      { encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.bytecode, '');
    assert.ok(result.diagnostics.some((d) => d.severity === 'error'));
    const frame = result.stackFrames.find((frame) => frame.blocked);
    assert.ok(frame, JSON.stringify(result));
    assert.deepEqual(frame.requiredInputs, required);
    assert.equal(frame.missing, missing);
    assert.equal(frame.after, undefined);
    assert.equal(frame.consumed, undefined);
    assert.equal(frame.produced, undefined);
    assert.equal(frame.before.length, required.length - missing);
  });
