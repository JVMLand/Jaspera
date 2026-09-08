import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { generateFonts } from './generate-fonts.ts';
import { generateTheme } from './generate-theme.ts';

await mkdir('src/generated', { recursive: true });
await import('./generate-language.ts');
await import('./generate-offset-parser.ts');
await generateTheme();
await generateFonts();
await mkdir('public/licenses', { recursive: true });
await cp('licenses', 'public/licenses', { recursive: true });
await cp('vendor/themes/LICENSE.txt', 'public/licenses/Darcula.txt');
await cp('THIRD_PARTY_NOTICES.md', 'public/THIRD_PARTY_NOTICES.md');
const compiler = 'public/runtime/jalweb-compiler.jar';
const runtime = 'public/runtime/jdk23.jar';
const catalog = 'src/generated/jdk.json';
try {
  const [compilerStat, runtimeStat, catalogStat] = await Promise.all([
    stat(compiler),
    stat(runtime),
    stat(catalog).catch(() => undefined),
  ]);
  if (!catalogStat || catalogStat.mtimeMs < Math.max(compilerStat.mtimeMs, runtimeStat.mtimeMs)) {
    const result = spawnSync('java', ['-cp', compiler, 'jalweb.Catalog', runtime, catalog], {
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('JDK catalog generation failed');
  }
} catch (error) {
  throw new Error('Cannot generate JDK catalog. Run pnpm run setup with Java 23 first.', {
    cause: error,
  });
}
console.log('Generated browser sources and public license files');
