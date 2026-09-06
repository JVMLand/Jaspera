import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { unzipSync } from 'fflate';
const revision = '3fd56c74656602eb32efefca46f51f074bef6bca';
const base = `https://raw.githubusercontent.com/anematode/b-jvm/${revision}`;
const assets = {
  '.cache/runtime/temurin23-jre.zip': 'https://github.com/adoptium/temurin23-binaries/releases/download/jdk-23.0.2%2B7/OpenJDK23U-jre_x64_windows_hotspot_23.0.2_7.zip',
  'public/runtime/jdk23/conf/logging.properties': `${base}/test/jdk23/conf/logging.properties`,
  'src/vendor/bovine/bjvm2.ts': `${base}/js/bjvm2.ts`,
  'src/vendor/build/bjvm_main.js': `${base}/build/bjvm_main.js`,
  'public/runtime/bjvm_main.wasm': `${base}/build/bjvm_main.wasm`,
  'licenses/JZlib.txt': 'https://raw.githubusercontent.com/ymnk/jzlib/1.1.3/LICENSE.txt',
  'licenses/Bovine-JVM.txt': `${base}/LICENSE`,
  'licenses/OpenJDK.txt': 'https://raw.githubusercontent.com/openjdk/jdk/jdk-23%2B37/LICENSE',
  'licenses/OpenJDK-classpath-exception.txt': 'https://raw.githubusercontent.com/openjdk/jdk/jdk-23%2B37/ADDITIONAL_LICENSE_INFO',
};
for (const name of ['jdk23.jar','jdk23/lib/modules','jdk23/lib/security/default.policy','jdk23/conf/security/java.security','jdk23/conf/security/java.policy']) assets[name==='jdk23.jar'?'.cache/runtime/jdk23.jar':`public/runtime/${name}`] = `${base}/test/${name}`;
let lock = {};
try { lock = JSON.parse(await readFile('vendor/runtime-lock.json', 'utf8')); } catch {}
lock['.cache/runtime/temurin23-jre.zip'] ??= { sha256: '8de3b72f164555ad4b847d45bad2e455d60d414b58f63a07e3c6e4b744a7e5a1' };
async function download(path, url) {
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  let bytes;
  try { bytes = await readFile(path); } catch {}
  const hash = b => createHash('sha256').update(b).digest('hex');
  if (!bytes || !lock[path] || hash(bytes) !== lock[path].sha256) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (lock[path] && hash(bytes) !== lock[path].sha256) throw new Error(`Integrity mismatch: ${path}`);
    await writeFile(path, bytes);
  }
  lock[path] = { url, sha256: hash(bytes), bytes: bytes.length };
  console.log(`${path}: ${bytes.length} bytes`);
}
await Promise.all(Object.entries(assets).map(([path,url]) => download(path,url)));
delete lock['public/runtime/jdk23.jar'];
await writeFile('vendor/runtime-lock.json', JSON.stringify(lock,null,2)+'\n');
// Keep the unmodified upstream source; patch its UTF-8 allocation bug in the build only.
let source = await readFile('src/vendor/bovine/bjvm2.ts','utf8');
source = source.replace('const malloced = module._malloc(2 * str.length);','const encoded = new TextEncoder().encode(str);\n        const malloced = module._malloc(encoded.length + 1);')
 .replace('const arr = new Uint8Array(module.HEAPU8.buffer, malloced, str.length);','const arr = new Uint8Array(module.HEAPU8.buffer, malloced, encoded.length);')
 .replace('const result = new TextEncoder().encodeInto(str, arr);','arr.set(encoded);\n        const result = { written: encoded.length };');
source = source.replace(/        const contentLength = response.headers.get\('Content-Length'\);[\s\S]*?return \{file, data\};/, `        if (!response.ok) throw new Error('Runtime download failed: ' + file + ' (' + response.status + ')');
        const data = new Uint8Array(await response.arrayBuffer());
        totalLoaded += data.length;
        options.progress?.(totalLoaded, TOTAL_BYTES);
        return {file, data};`);
await build({ stdin: { contents:source, resolveDir:'src/vendor/bovine', loader:'ts' }, bundle:true, format:'esm', platform:'browser', outfile:'public/runtime/bovine.js', target:'es2022', logLevel:'warning' });
const jre=unzipSync(await readFile('.cache/runtime/temurin23-jre.zip'),{filter:entry=>entry.name.endsWith('/lib/tzdb.dat')});
const tzdb=Object.values(jre)[0];
if(!tzdb)throw new Error('OpenJDK timezone database is missing');
await writeFile('public/runtime/jdk23/lib/tzdb.dat',tzdb);
await import('./build-compiler.mjs');
await import('./generate-language.mjs');
