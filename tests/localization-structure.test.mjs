import test from 'node:test';
import assert from 'node:assert/strict';
import { readCatalogs, validateCatalogs, parseCatalog } from '../scripts/localization-catalogs.mjs';
import { checkLocalization } from '../scripts/check-localization.mjs';

test('feature catalogs have matching translations and all source/template keys resolve', async () => {
  const { catalogs } = await readCatalogs();
  const templates = await checkLocalization(catalogs);
  assert.ok(templates.length >= 17);
});

test('catalog validation rejects omissions, duplicates, empty text, HTML and opaque keys', () => {
  assert.throws(
    () => parseCatalog('{"test.label":"One","test.label":"Two"}', 'duplicate.json'),
    /duplicate JSON key/,
  );
  const feature = (ja, en = ja) => ({ directory: 'fixture/locales', catalogs: { ja, en } });
  const valid = { 'test.label': 'Value {0}' };
  for (const bad of [
    [feature(valid, {})],
    [feature(valid, { ...valid, 'test.extra': 'Extra' })],
    [feature(valid), feature(valid)],
    [feature({ 'test.empty': ' ' })],
    [feature({ 'test.html': '<button>Go</button>' })],
    [feature({ mf6c244f98893: 'Close' })],
    [feature(valid, { 'test.label': 'Value {1}' })],
    [feature({ 'test.rich': '{kbd}F8{/strong}' })],
  ])
    assert.throws(() => validateCatalogs(bad, ['ja', 'en']));
  assert.doesNotThrow(() =>
    validateCatalogs([feature({ 'test.jvm': 'constructor <init>' })], ['ja', 'en']),
  );
});
