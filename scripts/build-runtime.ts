import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { bundleRuntime } from './bundle-runtime.ts';
import { revision, sdkVersion, source, output, ensureBovineSource } from './bovine.ts';
const root = resolve('.');
ensureBovineSource();
const digest = createHash('sha256')
  .update(revision + sdkVersion)
  .digest('hex');
const stamp = join(output, 'jaspera-build.json');
let cached = false;
try {
  cached = JSON.parse(await readFile(stamp, 'utf8')).sourceHash === digest;
  await access(join(output, 'bjvm_main.wasm'));
} catch {
  cached = false;
}
function run(command: string, args: string[], cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
if (!cached) {
  await mkdir('.cache', { recursive: true });
  // A fixed SDK is required: the interpreter's postprocessor is version-sensitive.
  const sdk = process.env.EMSDK ? resolve(process.env.EMSDK) : resolve('.cache/emsdk');
  if (!existsSync(join(sdk, 'emsdk.py')))
    run('git', ['clone', '--depth', '1', 'https://github.com/emscripten-core/emsdk', sdk]);
  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  run(python, [join(sdk, 'emsdk.py'), 'install', sdkVersion]);
  run(python, [join(sdk, 'emsdk.py'), 'activate', sdkVersion]);
  process.env.PATH = [
    resolve('node_modules/.bin'),
    resolve('.cache/build-tools/cmake/data/bin'),
    resolve('.cache/build-tools/bin'),
    process.env.PATH,
  ].join(delimiter);
  process.env.PYTHONPATH = [resolve('.cache/build-tools'), process.env.PYTHONPATH]
    .filter(Boolean)
    .join(delimiter);
  const cmake = process.env.CMAKE ?? 'cmake';
  const args = [
    '-S',
    source,
    '-B',
    output,
    '-G',
    'Ninja',
    '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_TESTING=OFF',
    '-DENABLE_LTO=OFF',
    `-DCMAKE_TOOLCHAIN_FILE=${join(sdk, 'upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake')}`,
  ];
  run(cmake, args);
  run(cmake, ['--build', output, '--target', 'bjvm_main', '-j', '4']);
  await writeFile(
    stamp,
    JSON.stringify({ revision, sdkVersion, sourceHash: digest }, null, 2) + '\n',
  );
}
await bundleRuntime();
console.log(`Bovine ${revision.slice(0, 12)} + Jaspera debugger (Emscripten ${sdkVersion})`);
