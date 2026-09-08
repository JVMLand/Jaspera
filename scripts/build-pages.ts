import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// Pages builds need a local Java/CMake toolchain. Nothing is installed system-wide.
const tools = resolve('.cache/cloudflare-tools');
const jdk = join(tools, 'jdk');
await mkdir(jdk, { recursive: true });
const archive = 'OpenJDK23U-jdk_x64_linux_hotspot_23.0.2_7.tar.gz';
const url = `https://github.com/adoptium/temurin23-binaries/releases/download/jdk-23.0.2%2B7/${archive}`;
function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
try {
  await access(join(jdk, 'bin/javac'));
} catch {
  const responses = await Promise.all([fetch(url), fetch(url + '.sha256.txt')]);
  if (responses.some((response) => !response.ok)) throw new Error('JDK download failed');
  const bytes = Buffer.from(await responses[0].arrayBuffer());
  const hash = (await responses[1].text()).trim().split(/\s+/)[0];
  if (createHash('sha256').update(bytes).digest('hex') !== hash)
    throw new Error('JDK checksum mismatch');
  await writeFile(join(tools, archive), bytes);
  run('tar', ['-xzf', join(tools, archive), '--strip-components=1', '-C', jdk]);
}
process.env.JAVA_HOME = jdk;
process.env.PATH = [join(jdk, 'bin'), process.env.PATH].join(delimiter);
run('python3', [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '--target',
  '.cache/build-tools',
  'cmake==3.31.6',
  'ninja==1.11.1.3',
]);
run('java', ['-version']);
run('pnpm', ['run', 'setup']);
run('pnpm', ['run', 'build:pages']);
