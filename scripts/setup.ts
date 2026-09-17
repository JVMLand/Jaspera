import {
  mkdir,
  writeFile,
  readFile,
  copyFile,
  cp,
  access,
  mkdtemp,
  rename,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { ensureBovineSource, source, revision } from './bovine.ts';
await mkdir('.cache', { recursive: true });
ensureBovineSource();
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const result = spawnSync(
  python,
  [
    join(source, 'scripts/setup-runtime.py'),
    '--cache',
    '.cache/openjdk27',
    '--output',
    '.cache/runtime27',
  ],
  { stdio: 'inherit', windowsHide: true },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('OpenJDK 27 runtime preparation failed');
const manifest = JSON.parse(await readFile('.cache/runtime27/runtime-manifest.json', 'utf8')) as {
  files: Record<string, { sha256: string; bytes: number }>;
};
for (const name of Object.keys(manifest.files)) {
  const destination = name === 'jdk27.jar' ? '.cache/runtime/jdk27.jar' : `public/runtime/${name}`;
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join('.cache/runtime27', name), destination);
}
for (const module of ['java.base', 'java.desktop', 'java.logging'])
  await cp(`.cache/openjdk27/linux/jdk-27/legal/${module}`, `licenses/OpenJDK27/${module}`, {
    recursive: true,
    dereference: true,
  });
await copyFile('.cache/openjdk27/linux/jdk-27/legal/java.base/LICENSE', 'licenses/OpenJDK.txt');
await copyFile(
  '.cache/openjdk27/linux/jdk-27/legal/java.base/ADDITIONAL_LICENSE_INFO',
  'licenses/OpenJDK-classpath-exception.txt',
);
await copyFile(join(source, 'LICENSE'), 'licenses/Bovine-JVM.txt');
const lock = JSON.parse(await readFile('vendor/runtime-lock.json', 'utf8'));
const jzlib = await readFile('licenses/JZlib.txt');
if (createHash('sha256').update(jzlib).digest('hex') !== lock['licenses/JZlib.txt'].sha256)
  throw new Error('JZlib license checksum mismatch');
await writeFile(
  'vendor/jdk27-runtime.json',
  JSON.stringify(
    {
      bovineRevision: revision,
      source: 'OpenJDK 27+35 (GPL), jdk-27+35',
      ...manifest,
    },
    null,
    2,
  ) + '\n',
);
await import('./build-runtime.ts');
await import('./build-compiler.ts');
// Preserve obsolete generated assets outside public/ so they are not deployed.
for (const name of ['jdk23', 'jdk23.jar']) {
  if (
    await access(`public/runtime/${name}`).then(
      () => true,
      () => false,
    )
  ) {
    const retired = await mkdtemp('.cache/retired-jdk23-');
    await rename(`public/runtime/${name}`, join(retired, name));
  }
}
await import('./generate.ts');
