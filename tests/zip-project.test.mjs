import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';
await build({
  entryPoints: ['src/zip-project.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: '.cache/zip-project.cjs',
});
const { openZipProject } = (await import('../.cache/zip-project.cjs')).default;
const zip = (entries) =>
  new File(
    [
      zipSync(
        Object.fromEntries(
          Object.entries(entries).map(([key, value]) => [
            key,
            typeof value === 'string' ? strToU8(value) : value,
          ]),
        ),
      ),
    ],
    'answers.zip',
  );
const props = JSON.stringify({
  format: 'jalprj',
  version: 1,
  name: 'Assignment',
  entryFile: 'src/Start.jal',
});

test('plain ZIP imports editable sources with folder-relative paths and no required properties', async () => {
  const result = await openZipProject(
    zip({
      'answers/Main.jal': 'main',
      'answers/util/Helper.jal': 'helper',
      'answers/readme.txt': 'notes',
    }),
  );
  assert.equal(result.properties, false);
  assert.deepEqual(result.project.files, [
    { path: 'Main.jal', source: 'main' },
    { path: 'util/Helper.jal', source: 'helper' },
  ]);
  assert.equal(result.project.workspace.entryFile, 'Main.jal');
});
test('exported and wrapped projects retain configured entry and editor layout', async () => {
  for (const prefix of ['', 'download/']) {
    const result = await openZipProject(
      zip({
        [prefix + 'project.jalprj']: props,
        [prefix + 'src/Start.jal']: 'start',
        [prefix + 'src/Main.jal']: 'main',
      }),
    );
    assert.equal(result.properties, true);
    assert.equal(result.project.name, 'Assignment');
    assert.equal(result.project.workspace.entryFile, 'src/Start.jal');
  }
});
test('invalid configuration, conflicting paths and excessive sources cannot replace the current project', async () => {
  await assert.rejects(openZipProject(zip({ 'project.jalprj': props, 'src/Main.jal': 'main' })));
  await assert.rejects(openZipProject(zip({ 'project.jalprj': props })));
  await assert.rejects(openZipProject(zip({ 'Main.jal': 'one', 'main.jal': 'two' })));
  await assert.rejects(openZipProject(zip({ '../Main.jal': 'bad' })));
  await assert.rejects(
    openZipProject(
      zip(Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`${i}.jal`, 'source']))),
    ),
  );
  await assert.rejects(openZipProject(zip({ 'Main.jal': 'x'.repeat(1024 * 1024 + 1) })));
  assert.equal(await openZipProject(zip({ 'readme.txt': 'notes' })), undefined);
});
