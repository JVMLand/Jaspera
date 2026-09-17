import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
export const revision = 'fb4df55cda5d6b29016e2421a037251a8b7852ab';
export const sdkVersion = '4.0.2';
export const source = resolve('.cache/bovine-jvm');
export const output = resolve(source, 'build-debugger');
export function ensureBovineSource() {
  function git(args: string[], cwd?: string) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'Bovine git operation failed');
    return result.stdout.trim();
  }
  if (!existsSync(resolve(source, '.git')))
    git(['clone', '--filter=blob:none', 'https://github.com/JVMLand/bovine-jvm.git', source]);
  if (git(['rev-parse', 'HEAD'], source) !== revision) {
    if (git(['status', '--porcelain', '--', '.', ':(exclude)build-debugger'], source))
      throw new Error('Cached Bovine sources have local changes; preserve them before updating.');
    git(['fetch', 'origin', revision], source);
    git(['checkout', '--detach', revision], source);
  }
}
