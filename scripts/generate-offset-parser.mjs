import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.cache/offset-parser', { recursive: true });
await mkdir('src/generated/offset-parser', { recursive: true });
const grammar = (await readFile('vendor/langjal/antlr/tokyo/peya/langjal/compiler/JAL.g4', 'utf8'))
  .replace(/options\s*\{[^}]*\}/, '')
  .replace(/@header\s*\{[^}]*\}/, '');
await writeFile('.cache/offset-parser/JAL.g4', grammar);
const result = spawnSync(
  'java',
  [
    '-jar',
    '.cache/java/antlr4-4.13.2-complete.jar',
    '-Dlanguage=JavaScript',
    '-no-listener',
    '-o',
    'src/generated/offset-parser',
    '-Xexact-output-dir',
    '.cache/offset-parser/JAL.g4',
  ],
  { stdio: 'inherit' },
);
if (result.status !== 0) throw new Error('ANTLR generation failed');
const opcodes = await readFile(
  'vendor/langjal/java/tokyo/peya/langjal/compiler/jvm/EOpcodes.java',
  'utf8',
);
const sizes = {};
for (const match of opcodes.matchAll(/case ([\s\S]*?) -> ([1-5]);/g))
  for (const name of match[1].split(',').map((s) => s.trim()))
    sizes[name.toLowerCase()] = Number(match[2]);
await writeFile('src/generated/offset-sizes.json', JSON.stringify(sizes, null, 2) + '\n');
