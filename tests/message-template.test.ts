import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: {
    contents: "export * from './src/i18n/template.ts'; export * from './src/messages.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { renderTemplate, setDisplayCatalog } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);

test('template text and attributes escape translations and positional data', () => {
  setDisplayCatalog({ 'common.close': '<img src=x onerror="alert(1)">' });
  try {
    assert.equal(
      renderTemplate('<button title="{{common.close}}">{{@0}}</button>', ['<script>&\'"'], true),
      '<button title="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;">&lt;script&gt;&amp;&#39;&quot;</button>',
    );
    assert.throws(() => renderTemplate('{{@1}}', ['one']), /Missing template value/);
    assert.throws(() => renderTemplate('{{missing.key}}'), /Unknown message/);
  } finally {
    setDisplayCatalog({});
  }
});
