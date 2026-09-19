import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export function parseCatalog(source, file) {
  const tree = ts.parseJsonText(file, source);
  const seen = new Set();
  const object = tree.statements[0]?.expression;
  if (object && ts.isObjectLiteralExpression(object))
    for (const property of object.properties) {
      const key = property.name?.text;
      if (seen.has(key)) throw new Error(`${file}: duplicate JSON key: ${key}`);
      seen.add(key);
    }
  return JSON.parse(source);
}

export async function readCatalogs(root = 'src/features') {
  const locales = JSON.parse(await readFile('src/i18n/locales.json', 'utf8'));
  const features = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (entry.name === 'locales') {
        const catalogs = {};
        const files = (await readdir(child)).filter((name) => name.endsWith('.json')).sort();
        if (
          JSON.stringify(files) !==
          JSON.stringify(
            Object.keys(locales)
              .map((l) => l + '.json')
              .sort(),
          )
        )
          throw new Error(`${child}: locale files do not match src/i18n/locales.json`);
        for (const locale of Object.keys(locales))
          catalogs[locale] = parseCatalog(
            await readFile(path.join(child, locale + '.json'), 'utf8'),
            path.join(child, locale + '.json'),
          );
        features.push({ directory: child.replaceAll('\\', '/'), catalogs });
      } else await walk(child);
    }
  }
  await walk(root);
  features.sort((a, b) => a.directory.localeCompare(b.directory));
  const catalogs = validateCatalogs(features, Object.keys(locales));
  return { features, catalogs, locales };
}

export const messageSlots = (value) => [...new Set(value.match(/\{\d+\}/g) ?? [])].sort();
export function validateCatalogs(features, locales) {
  const result = Object.fromEntries(locales.map((locale) => [locale, {}]));
  for (const { directory, catalogs } of features) {
    const canonical = catalogs.ja;
    if (!canonical) throw new Error(`${directory}: missing Japanese catalog`);
    const keys = Object.keys(canonical).sort();
    for (const locale of locales) {
      const catalog = catalogs[locale];
      if (!catalog || JSON.stringify(Object.keys(catalog).sort()) !== JSON.stringify(keys))
        throw new Error(`${directory}/${locale}: missing or extra translation keys`);
      for (const key of keys) {
        const value = catalog[key];
        if (!/^[a-zA-Z][\w]*(?:\.[\w]+)+$/.test(key) || /(?:^|\.)[mh][0-9a-f]{12}$/.test(key))
          throw new Error(`${directory}: use a semantic message key: ${key}`);
        if (Object.hasOwn(result[locale], key)) throw new Error(`Duplicate message key: ${key}`);
        if (typeof value !== 'string' || !value.trim())
          throw new Error(`${locale}: empty message: ${key}`);
        // JVM names such as <init> and <clinit> are text, not HTML.
        if (
          /<\/?(?:html|body|div|span|p|h[1-6]|a|button|input|section|header|footer|nav|main|aside|form|label|select|option|textarea|pre|code|kbd|strong|em|table|thead|tbody|tr|th|td|ul|ol|li|img|svg|script|style|br|progress)\b[^>]*>/i.test(
            value,
          )
        )
          throw new Error(`${locale}: HTML belongs in a template: ${key}`);
        if (JSON.stringify(messageSlots(value)) !== JSON.stringify(messageSlots(canonical[key])))
          throw new Error(`${locale}: mismatched interpolation slots: ${key}`);
        const stack = [];
        for (const match of value.matchAll(/\{(\/?)([a-z][a-zA-Z]*)\}/g)) {
          if (match[1]) {
            if (stack.pop() !== match[2])
              throw new Error(`${locale}: unbalanced rich slot: ${key}`);
          } else stack.push(match[2]);
        }
        if (stack.length) throw new Error(`${locale}: unclosed rich slot: ${key}`);
        result[locale][key] = value;
      }
    }
  }
  return result;
}
