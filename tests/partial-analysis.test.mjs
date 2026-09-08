import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = '.cache/partial-analysis';
await mkdir(dir, { recursive: true });
for (const [name, broken] of [
  ['type', 'iconst_1 areturn'],
  ['syntax', 'bipush ? return'],
  ['locals', 'iload 99 ireturn'],
])
  test('healthy methods survive ' + name + ' errors', async () => {
    const path = dir + '/' + name + '.jal';
    await writeFile(
      path,
      `public class Partial (major_version=67, minor_version=0) {
 public static before()I { iconst_1 ireturn }
 public static broken()I { ${broken} }
 public static after()I { iconst_2 ireturn }
 }`,
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
    assert.deepEqual(
      result.graphs.map((g) => g.name),
      ['before()I', 'after()I'],
    );
    assert.ok(result.stackFrames.some((f) => f.line === 2));
    assert.ok(result.stackFrames.some((f) => f.line === 4));
    assert.ok(!result.stackFrames.some((f) => f.line === 3));
  });
