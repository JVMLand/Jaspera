import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, delimiter } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
const deps = {
  'jzlib-1.1.3.jar': 'https://repo.maven.apache.org/maven2/com/jcraft/jzlib/1.1.3/jzlib-1.1.3.jar',
  'antlr4-4.13.2-complete.jar': 'https://www.antlr.org/download/antlr-4.13.2-complete.jar',
  'asm-9.8.jar': 'https://repo.maven.apache.org/maven2/org/ow2/asm/asm/9.8/asm-9.8.jar',
  'asm-tree-9.8.jar':
    'https://repo.maven.apache.org/maven2/org/ow2/asm/asm-tree/9.8/asm-tree-9.8.jar',
  'asm-commons-9.8.jar':
    'https://repo.maven.apache.org/maven2/org/ow2/asm/asm-commons/9.8/asm-commons-9.8.jar',
  'asm-analysis-9.8.jar':
    'https://repo.maven.apache.org/maven2/org/ow2/asm/asm-analysis/9.8/asm-analysis-9.8.jar',
  'lombok-1.18.42.jar':
    'https://repo.maven.apache.org/maven2/org/projectlombok/lombok/1.18.42/lombok-1.18.42.jar',
  'annotations-26.0.2.jar':
    'https://repo.maven.apache.org/maven2/org/jetbrains/annotations/26.0.2/annotations-26.0.2.jar',
};
await mkdir('.cache/java', { recursive: true });
await mkdir('java/build/generated', { recursive: true });
await mkdir('java/build/classes', { recursive: true });
await mkdir('public/runtime', { recursive: true });
let lock = {};
try {
  lock = JSON.parse(await readFile('vendor/compiler-lock.json', 'utf8'));
} catch {}
await Promise.all(
  Object.entries(deps).map(async ([name, url]) => {
    const path = `.cache/java/${name}`;
    let bytes;
    try {
      bytes = await readFile(path);
    } catch {}
    if (!bytes) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed ${url}: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (lock[name] && lock[name].sha256 !== sha256) throw new Error(`Integrity mismatch: ${name}`);
    lock[name] = { url, sha256 };
    await writeFile(path, bytes);
  }),
);
await writeFile('vendor/compiler-lock.json', JSON.stringify(lock, null, 2) + '\n');
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
const grammar = 'vendor/langjal/antlr/tokyo/peya/langjal/compiler/JAL.g4';
run('java', [
  '-jar',
  '.cache/java/antlr4-4.13.2-complete.jar',
  '-o',
  resolve('java/build/generated'),
  '-Xexact-output-dir',
  grammar,
]);
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}
const sources = (
  await Promise.all(['vendor/langjal/java', 'java/src', 'java/build/generated'].map(walk))
)
  .flat()
  .filter((p) => p.endsWith('.java'));
const cp = Object.keys(deps)
  .map((name) => resolve('.cache/java', name))
  .join(delimiter);
const args = [
  '--release',
  '21',
  '-encoding',
  'UTF-8',
  '-classpath',
  cp,
  '-processorpath',
  resolve('.cache/java/lombok-1.18.42.jar'),
  '-d',
  resolve('java/build/classes'),
  ...sources.map((p) => resolve(p)),
];
await writeFile(
  'java/build/javac.args',
  args.map((s) => '"' + s.replaceAll('\\', '/') + '"').join('\n'),
);
run('javac', ['@java/build/javac.args']);
const jar = {};
for (const name of Object.keys(deps).filter(
  (n) => !n.startsWith('lombok') && !n.startsWith('annotations'),
)) {
  const contents = unzipSync(await readFile(`.cache/java/${name}`));
  for (const [path, bytes] of Object.entries(contents)) {
    if (
      path.startsWith('org/antlr/v4/runtime/') ||
      (!name.startsWith('antlr') && !path.startsWith('META-INF/') && path !== 'module-info.class')
    )
      jar[path] = bytes;
  }
}
for (const path of await walk('java/build/classes'))
  jar[path.slice('java/build/classes/'.length)] = new Uint8Array(await readFile(path));
jar['META-INF/MANIFEST.MF'] = new TextEncoder().encode(
  'Manifest-Version: 1.0\r\nMain-Class: jalweb.Bridge\r\n\r\n',
);
await writeFile('public/runtime/jalweb-compiler.jar', zipSync(jar, { level: 6 }));
console.log(`Built compiler: ${sources.length} Java sources; ANTLR 4.13.2 / ASM 9.8`);

await mkdir('src/generated', { recursive: true });
await mkdir('java/build/patches', { recursive: true });
run('javac', [
  '-source',
  '21',
  '-target',
  '21',
  '-encoding',
  'UTF-8',
  '--patch-module',
  'java.base=java/patches',
  '--add-reads',
  'java.base=ALL-UNNAMED',
  '-classpath',
  '.cache/java/jzlib-1.1.3.jar',
  '-d',
  'java/build/patches',
  ...(await walk('java/patches')).filter((p) => p.endsWith('.java')),
]);
run('java', [
  '-cp',
  'public/runtime/jalweb-compiler.jar',
  'jalweb.PatchRuntime',
  '.cache/runtime/jdk23.jar',
  'java/build/patches',
]);
const runtime = unzipSync(await readFile('.cache/runtime/jdk23.jar'));
for (const [path, bytes] of Object.entries(
  unzipSync(await readFile('.cache/java/jzlib-1.1.3.jar')),
))
  if (path.startsWith('com/')) runtime[path] = bytes;
for (const path of await walk('java/build/patches'))
  runtime[path.slice('java/build/patches/'.length)] = new Uint8Array(await readFile(path));
await writeFile('public/runtime/jdk23.jar', zipSync(runtime, { level: 6 }));
run('java', [
  '-cp',
  'public/runtime/jalweb-compiler.jar',
  'jalweb.Catalog',
  'public/runtime/jdk23.jar',
  'src/generated/jdk.json',
]);

run('java', [
  '-cp',
  'public/runtime/jalweb-compiler.jar',
  'tokyo.peya.langjal.analyser.ClassHierarchy',
  'public/runtime/jdk23.jar',
  'java/build/hierarchy.tsv',
]);
jar['langjal/hierarchy.tsv'] = new Uint8Array(await readFile('java/build/hierarchy.tsv'));
await writeFile('public/runtime/jalweb-compiler.jar', zipSync(jar, { level: 6 }));
