import { generateSW, getManifest } from 'workbox-build';
import { createHash } from 'node:crypto';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory())
      files.push(...(await inventory(join(directory, entry.name), relative + '/')));
    else if (
      !entry.name.startsWith('.') &&
      !['sw.js', 'offline-manifest.json'].includes(entry.name) &&
      !entry.name.endsWith('.map')
    )
      files.push({ url: relative, bytes: (await stat(join(directory, entry.name))).size });
  }
  return files;
}
const files = await inventory('dist');
const manifestOptions = {
  globDirectory: 'dist',
  globPatterns: ['**/*'],
  globIgnores: ['**/*.map', '**/.*', 'sw.js', 'offline-manifest.json'],
  maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
};
const { manifestEntries, warnings } = await getManifest(manifestOptions);
if (warnings.length) throw new Error(warnings.join('\n'));
const cacheId =
  'jaspera-' +
  createHash('sha256')
    .update(JSON.stringify([...manifestEntries].sort((a, b) => a.url.localeCompare(b.url))))
    .digest('hex')
    .slice(0, 16);
await writeFile(
  'dist/offline-manifest.json',
  JSON.stringify({
    bytes: files.reduce((n, f) => n + f.bytes, 0),
    files: files.length,
    urls: files.map((f) => f.url),
    cacheId,
    entries: manifestEntries,
  }),
);
const result = await generateSW({
  cacheId,
  globDirectory: 'dist',
  globPatterns: ['**/*'],
  globIgnores: ['**/*.map', '**/.*', 'sw.js'],
  swDest: 'dist/sw.js',
  maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
  inlineWorkboxRuntime: true,
  clientsClaim: true,
  skipWaiting: false,
  ignoreURLParametersMatching: [/.*/],
  cleanupOutdatedCaches: true,
});
if (result.warnings.length) throw new Error(result.warnings.join('\n'));
console.log(`Offline: ${result.count} files, ${(result.size / 1024 / 1024).toFixed(1)} MiB`);
