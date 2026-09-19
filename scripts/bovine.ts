import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const dependency: string = manifest.devDependencies['bovine-jvm'];
const match = /^github:JVMLand\/bovine-jvm#([a-f0-9]{40})$/.exec(dependency);
if (!match) throw new Error('Pin bovine-jvm to a full GitHub commit SHA in package.json.');
export const revision = match[1];
export const sdkVersion = '4.0.2';
export const source = dirname(require.resolve('bovine-jvm/package.json'));
// Keep generated files outside pnpm's immutable package store, separately per revision.
export const output = resolve('.cache/bovine-build', revision);
export function ensureBovineSource() {
  for (const file of ['CMakeLists.txt', 'js/bjvm2.ts', 'scripts/setup-runtime.py']) {
    if (!existsSync(resolve(source, file)))
      throw new Error(`Bovine source is incomplete (${file}); run pnpm install --frozen-lockfile.`);
  }
}
