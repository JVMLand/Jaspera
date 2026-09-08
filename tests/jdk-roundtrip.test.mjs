import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
const dir = '.cache/jdk-roundtrip';
await mkdir(dir, { recursive: true });
await writeFile(
  dir + '/Probe.java',
  `import jalweb.Bridge; import java.nio.file.*; import java.util.*; public class Probe {public static void main(String[] a)throws Exception{System.out.print(Bridge.disassemble(Base64.getEncoder().encodeToString(Files.readAllBytes(Path.of(a[0])))));}}`,
);
function java(args) {
  const r = spawnSync('java', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 90000,
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
const names = [
  'java/lang/String',
  'java/lang/System',
  'java/io/PrintStream',
  'java/util/ArrayList',
  'java/util/HashMap',
  'java/lang/Integer',
  'java/util/Objects',
  'java/util/Optional',
];
const jar = unzipSync(await readFile('public/runtime/jdk23.jar'), {
  filter: (entry) => names.some((name) => entry.name === name + '.class'),
});
for (const name of names)
  test('JDK roundtrip: ' + name, async () => {
    const path = dir + '/' + name.split('/').pop();
    await writeFile(path + '.class', jar[name + '.class']);
    const dis = java([
      '-cp',
      'public/runtime/jalweb-compiler.jar',
      dir + '/Probe.java',
      path + '.class',
    ]);
    assert.ok(dis.source);
    await writeFile(path + '.jal', dis.source);
    const result = java([
      '-cp',
      'public/runtime/jalweb-compiler.jar',
      'jalweb.Bridge',
      path + '.jal',
    ]);
    assert.deepEqual(
      result.diagnostics.filter((d) => d.severity === 'error'),
      [],
    );
    assert.ok(result.bytecode);
    assert.ok(result.graphs.length);
    assert.ok(result.stackFrames.length);
  });
