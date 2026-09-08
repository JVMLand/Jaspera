import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
const directory = '.cache/array-local-slots';
await mkdir(directory, { recursive: true });
function java(args) {
  const r = spawnSync('java', args, { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
async function compile(name, source) {
  const path = directory + '/' + name + '.jal';
  await writeFile(path, source);
  return JSON.parse(java(['-cp', 'public/runtime/jalweb-compiler.jar', 'jalweb.Bridge', path]));
}
test('long and double arrays occupy one local slot, including multidimensional arrays and instance parameters', async () => {
  const result = await compile(
    'slots',
    `public class Slots (major_version=67, minor_version=0) {
 public static longs([JI)I { iload_1 ireturn }
 public static doubles([DI)I { iload_1 ireturn }
 public static nestedLongs([[JI)I { iload_1 ireturn }
 public static nestedDoubles([[DI)I { iload_1 ireturn }
 public static mixed(J[DI)I { iload_3 ireturn }
 public instance([JI)I { iload_2 ireturn }
 }`,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.bytecode);
  const probe = directory + '/Run.java';
  await writeFile(
    probe,
    `import java.util.*; public class Run extends ClassLoader {public static void main(String[] a) throws Exception {
 Class<?> c=new Run().defineClass(null,Base64.getDecoder().decode(a[0]),0,Base64.getDecoder().decode(a[0]).length);
 Object[][] cases={{"longs",long[].class,new long[0]},{"doubles",double[].class,new double[0]},{"nestedLongs",long[][].class,new long[0][]},{"nestedDoubles",double[][].class,new double[0][]}};
 for(Object[] item:cases)if(!c.getMethod((String)item[0],(Class<?>)item[1],int.class).invoke(null,item[2],42).equals(42))throw new AssertionError();
 if(!c.getMethod("mixed",long.class,double[].class,int.class).invoke(null,7L,new double[0],42).equals(42))throw new AssertionError();
 }} `,
  );
  java([probe, result.bytecode]);
});
test('the second slot of scalar long remains unreadable as an int', async () => {
  const result = await compile(
    'invalid',
    'public class Invalid (major_version=67, minor_version=0) { public static value(JI)I { iload_1 ireturn } }',
  );
  assert.equal(result.bytecode, '');
  assert.ok(result.diagnostics.some((d) => d.severity === 'error'));
});
test('bundled ArrayList round-trips with all method frames and graphs', async () => {
  const entry = 'java/util/ArrayList.class',
    bytes = unzipSync(await readFile('public/runtime/jdk23.jar'), {
      filter: (f) => f.name === entry,
    })[entry];
  assert.ok(bytes);
  const probe = directory + '/Disassemble.java';
  await writeFile(
    probe,
    'import jalweb.Bridge; public class Disassemble {public static void main(String[] a){System.out.print(Bridge.disassemble(a[0]));}}',
  );
  const source = JSON.parse(
    java([
      '-cp',
      'public/runtime/jalweb-compiler.jar',
      probe,
      Buffer.from(bytes).toString('base64'),
    ]),
  ).source;
  const result = await compile('ArrayList', source);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.bytecode);
  assert.equal(result.graphs.length, 68);
  assert.equal(
    result.graphs.reduce((sum, g) => sum + g.nodes.length, 0),
    1533,
  );
  assert.ok(result.stackFrames.length > 0);
});
