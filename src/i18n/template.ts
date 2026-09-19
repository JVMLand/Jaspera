import { msg, displayMessage, type MessageKey } from '../messages.js';

const escapeHTML = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

/** Only templates contain markup. Message text and positional values are always escaped. */
export function renderTemplate(
  source: string,
  values: readonly unknown[] = [],
  translated = false,
) {
  const message = translated ? displayMessage : msg;
  const markup = source.replace(/\{\{(@\d+|[\w.]+)\}\}/g, (_, key: string) => {
    if (key.startsWith('@')) {
      const index = Number(key.slice(1));
      if (index >= values.length) throw new Error(`Missing template value: ${key}`);
      return escapeHTML(values[index]);
    }
    return escapeHTML(message(key as MessageKey));
  });
  // The editor gutter calls this for every visible line; plain templates need no DOM parsing.
  if (!source.includes('data-i18n-rich')) return markup;
  const template = document.createElement('template');
  template.innerHTML = markup;
  for (const element of template.content.querySelectorAll<HTMLElement>('[data-i18n-rich]')) {
    const key = element.dataset.i18nRich as MessageKey;
    const slots = new Map(
      [...element.children].map((child) => [child.getAttribute('data-slot'), child]),
    );
    const fragment = document.createDocumentFragment();
    const parents: (Element | DocumentFragment)[] = [fragment];
    const names: string[] = [];
    const text = message(key);
    let offset = 0;
    for (const token of text.matchAll(/\{(\/?)([a-z][a-zA-Z]*)\}/g)) {
      parents.at(-1)!.append(document.createTextNode(text.slice(offset, token.index)));
      if (token[1]) {
        if (names.pop() !== token[2]) throw new Error(`Unbalanced rich slot: ${key}`);
        parents.pop();
      } else {
        const prototype = slots.get(token[2]);
        if (!prototype) throw new Error(`Unknown rich slot ${token[2]}: ${key}`);
        const child = prototype.cloneNode(false) as Element;
        child.removeAttribute('data-slot');
        parents.at(-1)!.append(child);
        parents.push(child);
        names.push(token[2]);
      }
      offset = token.index! + token[0].length;
    }
    if (names.length) throw new Error(`Unclosed rich slot: ${key}`);
    fragment.append(document.createTextNode(text.slice(offset)));
    element.replaceChildren(fragment);
    element.removeAttribute('data-i18n-rich');
  }
  return template.innerHTML;
}
