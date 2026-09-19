import { generateSW, getManifest } from 'workbox-build';
import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { version } from '../package.json';
const manifestOptions = {
  globDirectory: 'dist',
  globPatterns: ['**/*'],
  globIgnores: [
    '**/*.map',
    '**/.*',
    '_headers',
    '_redirects',
    'sw.js',
    'offline-manifest.json',
    'offline-update.json',
    // Release-note text remains available offline; screenshots load on demand online.
    'assets/changelog/**',
  ],
  maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
};
const { manifestEntries, warnings } = await getManifest(manifestOptions);
if (warnings.length) throw new Error(warnings.join('\n'));
const files = await Promise.all(
  manifestEntries.map(async ({ url }) => ({ url, bytes: (await stat(join('dist', url))).size })),
);
// Workbox already keys every entry by its revision. A build-specific cache name
// would download unchanged runtime archives and licenses again on every update.
const cacheId = 'jaspera';
const manifest = JSON.stringify({
  version: version.replace(/\.0$/, ''),
  buildId: createHash('sha256')
    .update(JSON.stringify([...manifestEntries].sort((a, b) => a.url.localeCompare(b.url))))
    .digest('hex'),
  bytes: files.reduce((n, f) => n + f.bytes, 0),
  files: files.length,
  urls: files.map((f) => f.url),
  cacheId,
  entries: manifestEntries,
});
await writeFile('dist/offline-manifest.json', manifest);
// This separate URL must never be precached: cache: 'no-store' alone does not bypass a SW.
await writeFile('dist/offline-update.json', manifest);
const result = await generateSW({
  ...manifestOptions,
  cacheId,
  globIgnores: manifestOptions.globIgnores.filter((path) => path !== 'offline-manifest.json'),
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
