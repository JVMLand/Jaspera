import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const bundle = await build({
  stdin: {
    contents: `export {analyzeSource} from './src/source-analysis-core.js';export {parseJal} from './src/jal-parse.js';export {parameterSlots} from './src/parameter-slots.js';export {calculateOffsets} from './src/offsets.js';export {inspectSource} from './src/inspections.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
});
const api = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const separate = (source: string) => ({
  parameters: api.parameterSlots(source),
  offsets: api.calculateOffsets(source),
  inspections: api.inspectSource(source),
});
const measure = (fn: (source: string) => unknown, source: string) => {
  const times = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    fn(source);
    times.push(performance.now() - start);
  }
  return +times.sort((a, b) => a - b)[4].toFixed(2);
};
const compareLL = process.argv.includes('--compare-ll');
const inputs = process.argv.slice(2).filter((arg) => arg !== '--compare-ll');
const sources = inputs.length
  ? await Promise.all(inputs.map(async (path) => [path, await readFile(path, 'utf8')]))
  : [
      [
        '1000 instructions',
        'public class Main { public static main()V {\n' + 'nop\n'.repeat(1000) + 'return\n}}',
      ],
    ];
const results = [];
for (const [name, source] of sources) {
  if (compareLL) {
    const start = performance.now(),
      slow = api.analyzeSource(source, (text: string) => api.parseJal(text, false));
    const llSharedMs = +(performance.now() - start).toFixed(2);
    assert.deepEqual(api.analyzeSource(source), slow);
    console.log(JSON.stringify({ name, llSharedMs, equivalent: true }));
  }
  for (let i = 0; i < 3; i++) {
    separate(source);
    api.analyzeSource(source);
  }
  results.push({
    name,
    characters: source.length,
    parseMs: measure(api.parseJal, source),
    separateMs: measure(separate, source),
    sharedMs: measure(api.analyzeSource, source),
  });
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      note: 'Warm Node.js medians of 9 runs; JavaScript editor analysis only, not JVM type or graph analysis.',
      results,
    },
    null,
    2,
  ),
);
