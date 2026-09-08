import { readdir, stat, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve('dist');
// Keep the original locally for compiler tests, but never upload this 28 MiB asset.
await stat(join(root, 'runtime/jdk23/lib/modules.gzip'));
await rm(join(root, 'runtime/jdk23/lib/modules'), { force: true });
let count = 0,
  largest = { name: '', bytes: 0 };
async function check(directory: string) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await check(path);
    else {
      const { size } = await stat(path);
      if (size > 25 * 1024 * 1024) throw new Error(`Pages asset exceeds 25 MiB: ${path}`);
      if (item.name === '_worker.js')
        throw new Error('Pages must remain static: unexpected _worker.js');
      if (size > largest.bytes) largest = { name: path.slice(root.length + 1), bytes: size };
      count++;
    }
  }
}
await check(root);
if (count > 20000) throw new Error('Pages asset count exceeds 20,000');
console.log(
  `Pages: ${count} files; largest ${largest.name} (${(largest.bytes / 1048576).toFixed(2)} MiB)`,
);
