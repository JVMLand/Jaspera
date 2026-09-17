import { access, readFile } from 'node:fs/promises';
for (const file of [
  'bovine.js',
  'bjvm_main.wasm',
  'jdk27.jar',
  'jdk27.jar.gzip',
  'jdk27/lib/modules',
  'jdk27/lib/modules.gzip',
  'jdk27/lib/tzdb.dat',
  'jalweb-compiler.jar',
]) {
  try {
    await access(`public/runtime/${file}`);
  } catch {
    throw new Error(`Missing runtime/${file}. Run pnpm run setup first.`);
  }
}

if (!(await readFile('public/runtime/bovine.js', 'utf8')).includes('jaspera_debug_enable'))
  throw new Error('Runtime has no debugger support. Run pnpm run build:runtime.');

if (!(await readFile('public/runtime/bovine.js', 'utf8')).includes('fetchRuntimeFile'))
  throw new Error('Runtime needs static gzip support. Run pnpm run build:runtime.');
