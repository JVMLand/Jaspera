import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

for (const [name, body] of [
  ['loop', 'ldc "hello"\n Print:\n  iconst_1\n  goto Print'],
  [
    'branch',
    'iconst_0\n  ifeq Other\n  ldc "hello"\n  goto Print\n Other:\n  iconst_1\n  ldc "hello"\n Print:\n  pop\n  return',
  ],
])
  test(`${name}: merge diagnostic retains location, stacks, hover and control flow`, async () => {
    const source = `public class Main {\n public static main([Ljava/lang/String;)V {\n  ${body}\n }\n public static valid()V { return }\n}`;
    await mkdir('.cache/merge-recovery', { recursive: true });
    const path = `.cache/merge-recovery/${name}.jal`;
    await writeFile(path, source);
    const run = spawnSync(
      'java',
      ['-cp', 'public/runtime/jalweb-compiler.jar', 'jalweb.Bridge', path],
      { encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.bytecode, '');
    assert.equal(result.diagnostics.length, 1, JSON.stringify(result.diagnostics));
    const error = result.diagnostics[0];
    assert.equal(error.line, source.split('\n').findIndex((line) => line.includes('Print:')) + 1);
    assert.equal(error.column, 2);
    assert.equal(error.length, 5);
    assert.match(error.message, /ラベル「Print」.*高さが一致しません/);
    assert.match(error.message, /java.lang.String/);
    assert.match(error.message, /int/);
    assert.ok(result.stackFrames.some((frame) => frame.partial && frame.after?.length));
    assert.ok(!result.stackFrames.some((frame) => frame.partial && frame.unreachable));
    const graph = result.graphs.find((graph) => graph.name.startsWith('main('));
    assert.equal(graph.partial, true);
    assert.ok(graph.nodes.some((node) => node.opcode === 'goto'));
    assert.ok(graph.edges.some((edge) => edge.kind === 'control' && edge.label === 'jump'));
    assert.ok(graph.edges.every((edge) => edge.kind === 'control' || edge.kind === 'exception'));
    assert.ok(result.graphs.some((graph) => graph.name === 'valid()V' && !graph.partial));
  });
