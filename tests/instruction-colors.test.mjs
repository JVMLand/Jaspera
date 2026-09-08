import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const b = await build({
  stdin: {
    contents:
      "export * from './src/instruction-colors';export {referenceThemes} from './src/reference-themes';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const m = await import(
  'data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64')
);
test('202 opcodes have exactly one Javasm highlight group, with corrected omissions', async () => {
  const names = JSON.parse(await readFile('src/generated/language.json')).instructions.filter(
    (x) => x !== 'aload_4',
  );
  const all = Object.values(m.instructionHighlightGroups).flat();
  assert.equal(all.length, 202);
  assert.equal(new Set(all).size, 202);
  assert.deepEqual([...all].sort(), names.sort());
  for (const op of ['ineg', 'lneg', 'fneg', 'dneg'])
    assert.equal(m.instructionHighlightGroup(op), 'value_calculations');
  assert.equal(m.instructionHighlightGroup('arraylength'), 'array_access');
  assert.equal(m.groupNames.length, 18);
});
test('all theme colors are distinct and legible on editor backgrounds', () => {
  const backgrounds = {
    'jal-night': '151a21',
    darcula: '2b2b2b',
    'vs-dark': '1e1e1e',
    vs: 'ffffff',
    'hc-black': '000000',
    'hc-light': 'ffffff',
    ...Object.fromEntries(m.referenceThemes.map((t) => [t.id, t.palette[0].slice(1)])),
  };
  const luminance = (h) =>
    [0, 2, 4]
      .map((n) => parseInt(h.slice(n, n + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  for (const [theme, bg] of Object.entries(backgrounds)) {
    const colors = Object.values(m.instructionColors(theme));
    assert.equal(new Set(colors).size, 18, theme);
    for (const c of colors) {
      const a = luminance(c),
        b = luminance(bg);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, theme + ' ' + c);
    }
  }
});
