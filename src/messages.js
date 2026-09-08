import japanese from './locales/ja.json' with { type: 'json' };
/** Canonical messages stay stable in models, workers and persisted state.
 * The presentation adapter resolves them in the selected locale. */
export function msg(key, values = []) {
  const template = japanese[key];
  if (template === undefined) throw new Error(`Unknown message: ${key}`);
  return template.replace(/\{(\d+)\}/g, (token, index) =>
    index < values.length ? String(values[index]) : token,
  );
}

let displayCatalog = japanese;
const sourceKeys = new Map(Object.entries(japanese).map(([key, value]) => [value, key]));
export function setDisplayCatalog(catalog) {
  displayCatalog = catalog;
}
export function displayText(text) {
  const key = Object.hasOwn(japanese, 'chrome.' + text) ? 'chrome.' + text : sourceKeys.get(text);
  return key ? (displayCatalog[key] ?? text) : text;
}
export function displayMessage(key, values = []) {
  const template = displayCatalog[key] ?? japanese[key];
  return template.replace(/\{(\d+)\}/g, (token, index) =>
    index < values.length ? displayText(String(values[index])) : token,
  );
}
