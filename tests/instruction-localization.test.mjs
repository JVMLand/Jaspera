import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './src/instruction-guide.ts';export * from './src/instruction-categories.ts';export {setDisplayCatalog} from './src/messages.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { guide, instructionList, instructionCategory, setDisplayCatalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);
const catalogs = Object.fromEntries(
  await Promise.all(
    ['ja', 'en', 'zh', 'es', 'it', 'fr', 'la'].map(async (lang) => [
      lang,
      JSON.parse(await readFile(`src/locales/${lang}.json`, 'utf8')),
    ]),
  ),
);

test('every instruction has translated titles, descriptions, diagrams and completion categories', () => {
  try {
    for (const [lang, catalog] of Object.entries(catalogs)) {
      setDisplayCatalog(catalog);
      for (const op of instructionList) {
        const { category, ...entry } = guide(op);
        assert.ok(entry.title && entry.summary && entry.markdown, `${lang}: ${op}`);
        if (lang !== 'ja')
          assert.doesNotMatch(
            JSON.stringify([entry, instructionCategory(op)]),
            /[\u3040-\u30ff]/,
            `${lang}: ${op}`,
          );
      }
      for (const [key, value] of Object.entries(catalog)) {
        const slots = (s) => [...new Set(s.match(/\{\d+\}/g) ?? [])].sort();
        assert.deepEqual(slots(value), slots(catalogs.ja[key]), `${lang}: ${key}`);
      }
    }
  } finally {
    setDisplayCatalog(catalogs.ja);
  }
});

test('arithmetic diagrams use stable symbols and retain operand order in every locale', () => {
  try {
    for (const catalog of Object.values(catalogs)) {
      setDisplayCatalog(catalog);
      for (const type of ['i', 'l', 'f', 'd'])
        for (const [op, symbol] of Object.entries({
          add: '+',
          sub: '−',
          mul: '×',
          div: '/',
          rem: '%',
        })) {
          const f = guide(type + op).forms[0];
          assert.deepEqual(
            f.before.map((v) => v.split(' : ')[0]),
            ['a', 'b'],
          );
          assert.equal(f.after[0].split(' : ')[0], `a ${symbol} b`);
        }
      for (const op of ['ishl', 'lshr', 'iushr']) {
        const f = guide(op).forms[0];
        assert.match(f.before[0], /^a : /);
        assert.equal(f.before[1], 'b : int');
      }
      assert.deepEqual(guide('if_icmpgt').forms[0].before, ['a', 'b']);
      assert.deepEqual(guide('d2i').forms[0].after, ['a : int']);
    }
  } finally {
    setDisplayCatalog(catalogs.ja);
  }
});
