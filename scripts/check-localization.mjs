import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';

/** Check source references, including keys kept in arrays/objects, not just msg('...'). */
export async function checkLocalization(catalogs, root = 'src') {
  const keys = new Set(Object.keys(catalogs.ja));
  const strings = new Set();
  const templates = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!['generated', 'locales'].includes(entry.name)) await walk(file);
        continue;
      }
      if (!/\.(?:ts|js|html)$/.test(file)) continue;
      const source = await readFile(file, 'utf8');
      if (file.endsWith('.html')) {
        templates.push({ file, source });
        for (const match of source.matchAll(/\{\{([\w.]+)\}\}|data-i18n-rich="([\w.]+)"/g)) {
          const key = match[1] ?? match[2];
          if (!keys.has(key)) throw new Error(`${file}: unknown template message: ${key}`);
          strings.add(key);
        }
        for (const block of source.matchAll(
          /<([a-z][a-z0-9]*)\b[^>]*data-i18n-rich="([\w.]+)"[^>]*>([\s\S]*?)<\/\1>/g,
        )) {
          const key = block[2];
          const slots = new Set(
            [...block[3].matchAll(/data-slot="(\w+)"/g)].map((match) => match[1]),
          );
          for (const [locale, catalog] of Object.entries(catalogs))
            for (const token of catalog[key].matchAll(/\{\/?([a-z][a-zA-Z]*)\}/g))
              if (!slots.has(token[1]))
                throw new Error(`${file}: ${locale}: unknown rich slot ${token[1]} in ${key}`);
        }
        continue;
      }
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const literal = (node) =>
        node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
      function visit(node) {
        if (literal(node)) {
          strings.add(node.text);
          if (/^[mh][0-9a-f]{12}$/.test(node.text))
            throw new Error(`${file}: opaque message key: ${node.text}`);
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const name = node.expression.text;
          const argument = node.arguments[name === 'bindMessage' ? 1 : 0];
          if (
            ['msg', 'displayMessage', 'localizedMessage', 'bindMessage'].includes(name) &&
            literal(argument) &&
            !keys.has(argument.text)
          )
            throw new Error(`${file}: unknown message: ${argument.text}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
  await walk(root);
  // These messages translate external compiler/vendor output by Japanese source text.
  const sourceLookup = ['analysis.stackMerge', 'instruction.title.', 'instruction.completion.'];
  const unused = [...keys].filter(
    (key) =>
      !strings.has(key) &&
      ![...strings].some((part) => part.endsWith('.') && key.startsWith(part)) &&
      !sourceLookup.some((part) => (part.endsWith('.') ? key.startsWith(part) : key === part)),
  );
  if (unused.length) throw new Error(`Unreferenced translation keys: ${unused.join(', ')}`);
  return templates;
}
