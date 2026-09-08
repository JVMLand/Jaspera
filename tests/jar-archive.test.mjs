import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
await build({
  entryPoints: ['src/jar-archive.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: '.cache/jar-unit.cjs',
});
const { JarArchive } = (await import('../.cache/jar-unit.cjs')).default;
const file = (entries) => new File([zipSync(entries)], 'sample.jar');
const source = async () => ({ source: 'original', className: 'Sample' });
const compiled = (bytes, className = 'Sample') => ({
  className,
  bytecode: Buffer.from(bytes).toString('base64'),
  diagnostics: [],
});
test('unchanged JAR is byte-identical and entries are loaded lazily', async () => {
  const input = file({
    'Sample.class': new Uint8Array([1, 2]),
    'assets/picture.bin': new Uint8Array([0, 255]),
  });
  const archive = await JarArchive.open(input);
  assert.equal(archive.sources.size, 0);
  let count = 0;
  await Promise.all([
    archive.source('Sample.class', async () => {
      count++;
      return source();
    }),
    archive.source('Sample.class', source),
  ]);
  assert.equal(count, 1);
  const result = await archive.export(() => assert.fail('unchanged class recompiled'));
  assert.deepEqual(result.bytes, new Uint8Array(await input.arrayBuffer()));
});
test('only changed classes are replaced; signatures removed, resources and manifest attributes retained', async () => {
  const manifest =
    'Manifest-Version: 1.0\r\nMain-Class: Sample\r\nLong-Attribute: abc\r\n def\r\n\r\nName: Sample.class\r\nSHA-256-Digest: abc\r\n def\r\n\r\n';
  const archive = await JarArchive.open(
    file({
      'Sample.class': new Uint8Array([1]),
      'Other.class': new Uint8Array([2]),
      'asset.bin': new Uint8Array([0, 255]),
      'META-INF/MANIFEST.MF': strToU8(manifest),
      'META-INF/X.SF': strToU8('signature'),
      'META-INF/X.RSA': new Uint8Array([3]),
    }),
  );
  const doc = await archive.source('Sample.class', source);
  doc.source = 'edited';
  assert.equal(archive.dirty, true);
  const result = await archive.export(async () => compiled([9]));
  const entries = unzipSync(result.bytes);
  assert.deepEqual(entries['Sample.class'], new Uint8Array([9]));
  assert.deepEqual(entries['Other.class'], new Uint8Array([2]));
  assert.deepEqual(entries['asset.bin'], new Uint8Array([0, 255]));
  assert.equal(entries['META-INF/X.SF'], undefined);
  assert.equal(entries['META-INF/X.RSA'], undefined);
  assert.match(strFromU8(entries['META-INF/MANIFEST.MF']), /Long-Attribute: abc\r\n def/);
  assert.doesNotMatch(strFromU8(entries['META-INF/MANIFEST.MF']), /Digest/);
  result.saved();
  assert.equal(archive.dirty, false);
  doc.source = 'edited again';
  assert.equal(archive.dirty, true);
});
test('failed compilation and class renaming cannot silently export broken changes', async () => {
  const archive = await JarArchive.open(file({ 'Sample.class': new Uint8Array([1]) }));
  (await archive.source('Sample.class', source)).source = 'bad';
  await assert.rejects(
    archive.export(async () => ({
      ...compiled([]),
      bytecode: '',
      diagnostics: [{ severity: 'error', message: 'syntax error' }],
    })),
    /syntax error/,
  );
  await assert.rejects(
    archive.export(async () => compiled([1], 'Renamed')),
    /Sample.class/,
  );
  assert.equal(archive.dirty, true);
});
test('invalid archives and unsafe paths are rejected', async () => {
  await assert.rejects(JarArchive.open(new File(['not a zip'], 'a.jar')));
  await assert.rejects(JarArchive.open(file({ '../outside.class': new Uint8Array([1]) })));
});
