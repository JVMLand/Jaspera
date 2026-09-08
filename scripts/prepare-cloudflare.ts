import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { promisify } from 'node:util';
const brotli = promisify(brotliCompress),
  gz = promisify(gzip);
const limit = 25 * 1024 * 1024;
const output = resolve('.cache/cloudflare');
const assets = join(output, 'assets');
type Asset = {
  hash: string;
  bytes: number;
  type: string;
  encodings?: Record<string, string>;
  path?: string;
};
const manifest: Record<string, Asset> = {};
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.jar': 'application/java-archive',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
// Content-addressed compression results survive builds; the upload list below excludes old files.
await mkdir(join(assets, '.packed'), { recursive: true });
let originalBytes = 0,
  transferredBytes = 0;
async function walk(dir: string, prefix = '') {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + item.name,
      source = join(dir, item.name);
    if (item.isDirectory()) {
      await walk(source, name + '/');
      continue;
    }
    if (!item.isFile() || item.name.startsWith('.') || name.endsWith('.map')) continue;
    const data = await readFile(source),
      hash = createHash('sha256').update(data).digest('hex');
    const entry: Asset = {
      hash,
      bytes: data.length,
      type: mime[extname(name)] ?? 'application/octet-stream',
    };
    originalBytes += data.length;
    if (data.length >= 128 * 1024) {
      const paths = { br: '.packed/' + hash + '.br', gzip: '.packed/' + hash + '.gz' };
      for (const [encoding, path] of Object.entries(paths)) {
        let packed;
        try {
          packed = await readFile(join(assets, path));
        } catch {
          packed =
            encoding === 'br'
              ? await brotli(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
              : await gz(data, { level: 9 });
          await writeFile(join(assets, path), packed);
        }
        if (packed.length > limit)
          throw Error(`${name}: ${encoding} exceeds the 25 MiB asset limit`);
      }
      entry.encodings = paths;
      transferredBytes += (await readFile(join(assets, paths.br))).length;
      console.log(
        `${name}: ${(data.length / 1048576).toFixed(2)} -> ${((await readFile(join(assets, paths.br))).length / 1048576).toFixed(2)} MiB (Brotli)`,
      );
    } else {
      entry.path = 'jaspera/' + name;
      await mkdir(join(assets, 'jaspera', prefix), { recursive: true });
      await copyFile(source, join(assets, entry.path));
      transferredBytes += data.length;
    }
    manifest['/jaspera/' + name] = entry;
  }
}
await walk('dist');
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Whitelist this build's files so stale cached versions never enter a deployment.
const included = Object.values(manifest).flatMap((e) =>
  e.encodings ? Object.values(e.encodings) : [e.path],
);
await writeFile(
  join(assets, '.assetsignore'),
  ['*', '!jaspera/', '!jaspera/**/', '!.packed/', ...included.map((p) => '!/' + p), ''].join('\n'),
);
console.log(
  `Cloudflare: ${(originalBytes / 1048576).toFixed(1)} -> ${(transferredBytes / 1048576).toFixed(1)} MiB with Brotli`,
);
