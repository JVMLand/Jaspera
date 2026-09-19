export type MessageKey = keyof typeof japanese;

import japanese from './generated/locales/ja.ts';
/** Canonical messages stay stable in models, workers and persisted state.
 * The presentation adapter resolves them in the selected locale. */
export function msg(key: MessageKey, values: unknown[] = []) {
  const template = japanese[key];
  if (template === undefined) throw new Error(`Unknown message: ${key}`);
  return template.replace(/\{(\d+)\}/g, (token, index) =>
    index < values.length ? String(values[index]) : token,
  );
}

let displayCatalog: Record<string, string> = japanese;
const sourceKeys = new Map(Object.entries(japanese).map(([key, value]) => [value, key]));
export function setDisplayCatalog(catalog: Record<string, string>) {
  displayCatalog = catalog;
}
export function displayText(text: string) {
  const key = Object.hasOwn(japanese, 'chrome.' + text) ? 'chrome.' + text : sourceKeys.get(text);
  return key ? (displayCatalog[key] ?? text) : text;
}
export function displayMessage(key: MessageKey, values: unknown[] = []) {
  const template = displayCatalog[key] ?? japanese[key];
  if (template === undefined) throw new Error(`Unknown message: ${key}`);
  return template.replace(/\{(\d+)\}/g, (token, index) =>
    index < values.length ? displayText(String(values[index])) : token,
  );
}
