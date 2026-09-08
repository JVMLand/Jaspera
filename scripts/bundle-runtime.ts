import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { readFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
export async function bundleRuntime() {
  const out = '.cache/b-jvm/build-debugger';
  let source = await readFile('.cache/b-jvm/js/bjvm2.ts', 'utf8');
  source = source.replace('../build/bjvm_main', '../build-debugger/bjvm_main');
  const fetchCall = 'await fetch(`${runtimeUrl}/${file}`';
  if (!source.includes(fetchCall)) throw new Error('Bovine runtime fetch call changed');
  source = source.replace(fetchCall, 'await fetchRuntimeFile(`${runtimeUrl}/${file}`');
  source =
    `import { fetchRuntimeFile } from ${JSON.stringify(resolve('src/runtime-download.ts'))};\n` +
    source;
  source = source
    .replace(
      'const malloced = module._malloc(2 * str.length);',
      'const encoded = new TextEncoder().encode(str); const malloced = module._malloc(encoded.length + 1);',
    )
    .replace(
      'const arr = new Uint8Array(module.HEAPU8.buffer, malloced, str.length);',
      'const arr = new Uint8Array(module.HEAPU8.buffer, malloced, encoded.length);',
    )
    .replace(
      'const result = new TextEncoder().encodeInto(str, arr);',
      'arr.set(encoded); const result = { written: encoded.length };',
    );
  source = source.replace(
    /        const contentLength = response.headers.get\('Content-Length'\);[\s\S]*?return \{file, data\};/,
    `        if (!response.ok) throw new Error('Runtime download failed: ' + file + ' (' + response.status + ')');
        const data = new Uint8Array(await response.arrayBuffer());
        totalLoaded += data.length; options.progress?.(totalLoaded, TOTAL_BYTES);
        return {file, data};`,
  );
  await mkdir('public/runtime', { recursive: true });
  await build({
    stdin: { contents: source, resolveDir: '.cache/b-jvm/js', loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: 'public/runtime/bovine.js',
    target: 'es2022',
    logLevel: 'warning',
  });
  await copyFile(out + '/bjvm_main.wasm', 'public/runtime/bjvm_main.wasm');
  const compressed = gzipSync(await readFile('public/runtime/jdk23/lib/modules'), { level: 9 });
  if (compressed.length > 25 * 1024 * 1024)
    throw new Error('Compressed JDK exceeds Pages asset limit');
  // .gz is treated as HTTP Content-Encoding by Vite; .gzip stays an opaque asset.
  await writeFile('public/runtime/jdk23/lib/modules.gzip', compressed);
  console.log(`JDK gzip: ${(compressed.length / 1048576).toFixed(2)} MiB`);
}
