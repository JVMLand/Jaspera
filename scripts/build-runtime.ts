import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { bundleRuntime } from './bundle-runtime.ts';
const revision = '3fd56c74656602eb32efefca46f51f074bef6bca',
  sdkVersion = '4.0.2';
const root = resolve('.'),
  source = resolve('.cache/b-jvm'),
  output = join(source, 'build-debugger');
const patch = await readFile('vendor/patches/bovine-debugger.patch');
const digest = createHash('sha256')
  .update(revision + sdkVersion)
  .update(patch)
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
  if (!existsSync(join(source, '.git')))
    run('git', ['clone', '--filter=blob:none', 'https://github.com/anematode/b-jvm', source]);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: source,
    encoding: 'utf8',
  }).stdout.trim();
  if (head !== revision) run('git', ['checkout', '--detach', revision], source);
  const reverse = spawnSync(
    'git',
    ['apply', '--reverse', '--check', resolve('vendor/patches/bovine-debugger.patch')],
    { cwd: source },
  );
  const applied = join(source, 'jaspera-applied.patch');
  if (reverse.status !== 0) {
    let restored = false;
    if (existsSync(applied)) {
      const check = spawnSync('git', ['apply', '--reverse', '--check', applied], { cwd: source });
      if (check.status !== 0)
        throw new Error(
          'Cached Bovine sources have local changes. Preserve them before rebuilding.',
        );
      run('git', ['apply', '--reverse', applied], source);
      restored = true;
    }
    try {
      run('git', ['apply', resolve('vendor/patches/bovine-debugger.patch')], source);
    } catch (error) {
      if (restored) run('git', ['apply', applied], source);
      throw error;
    }
  }
  await writeFile(applied, patch);
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
