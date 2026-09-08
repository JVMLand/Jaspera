import i18next from 'i18next';
import japanese from './locales/ja.json';
import { msg, setDisplayCatalog, displayMessage } from './messages.js';
import './localization.css';
export const locales = {
  ja: '日本語',
  en: 'English',
  zh: '简体中文',
  es: 'Español',
  it: 'Italiano',
  fr: 'Français',
  la: 'Latina',
};
export type Locale = keyof typeof locales;
type Catalog = Record<string, string>;
const storageKey = 'jaspera.locale';
const engine = i18next.createInstance();
void engine.init({
  lng: 'ja',
  fallbackLng: 'ja',
  resources: { ja: { translation: japanese } },
  initAsync: false,
  interpolation: { prefix: '{', suffix: '}', escapeValue: false },
});
const loaders = import.meta.glob<{ default: Catalog }>('./locales/{en,zh,es,it,fr,la}.json');
let locale: Locale = 'ja',
  request = 0;
export const currentLocale = () => locale;
export const localizedMessage = (key: string) => String(engine.t(key));
export function localizedContent(source: string) {
  const key = sourceKeys.get(source);
  return key ? localizedMessage(key) : translate(source);
}
const canonical = japanese as Catalog;
const sourceKeys = new Map(Object.entries(canonical).map(([key, source]) => [source, key]));
const boundRenderers = new WeakMap<HTMLElement, () => void>();
/** Render a presentation component directly and refresh it only on language changes. */
export function bindTranslation(element: HTMLElement, render: () => void) {
  element.dataset.localized = '';
  element.translate = false;
  boundRenderers.set(element, render);
  render();
}
export function bindMessage(element: HTMLElement, key: keyof typeof japanese) {
  bindTranslation(element, () => {
    element.textContent = displayMessage(key);
  });
}
function renderBoundMessages() {
  for (const node of document.querySelectorAll<HTMLElement>('[data-localized]'))
    boundRenderers.get(node)?.();
}
const originals = new WeakMap<Node, Map<string, { source: string; rendered: string }>>();
const attributes = ['title', 'placeholder', 'aria-label', 'aria-description', 'alt'];
const protectedContent =
  'script,style,pre,code,kbd,[translate="no"],.view-lines,.inputarea,[data-pane-kind="editor"] .file-tab,#file-list,#project-name,#summary-project-name,.debug-frames,.instruction-graph svg';
let exact = new Map<string, string>(),
  patterns: { regex: RegExp; target: string; slots: number[] }[] = [];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function register(source: string, target: string) {
  source = source.trim();
  target = target.trim();
  if (!source || source === target) return;
  if (!/\{\d+\}/.test(source)) {
    exact.set(source, target);
    return;
  }
  const slots: number[] = [];
  let at = 0,
    pattern = '';
  for (const match of source.matchAll(/\{(\d+)\}/g)) {
    pattern += escape(source.slice(at, match.index)) + '([\\s\\S]*?)';
    slots.push(Number(match[1]));
    at = match.index! + match[0].length;
  }
  patterns.push({
    regex: new RegExp('^' + pattern + escape(source.slice(at)) + '$'),
    target,
    slots,
  });
}
function rebuild(catalog: Catalog) {
  exact = new Map();
  patterns = [];
  for (const [key, source] of Object.entries(canonical))
    if (key.startsWith('chrome.')) register(key.slice(7), catalog[key] ?? source);
  for (const [key, source] of Object.entries(canonical)) {
    const target = catalog[key] ?? source;
    register(source, target);
    // Preserve markup and translate only its authored text/accessible attributes.
    const fragments = (html: string) => {
      const template = document.createElement('template');
      template.innerHTML = html;
      const result: string[] = [];
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          result.push(node.textContent ?? '');
          return;
        }
        if (node instanceof Element) {
          for (const attr of attributes)
            if (node.hasAttribute(attr)) result.push(node.getAttribute(attr)!);
        }
        for (const child of node.childNodes) walk(child);
      };
      walk(template.content);
      return result;
    };
    if (/<\/?[a-z][^>]*>/i.test(source)) {
      const a = fragments(source),
        b = fragments(target);
      if (a.length === b.length) a.forEach((value, i) => register(value, b[i]));
    }
    // Markdown headings and paragraphs are rendered as separate DOM text nodes.
    const a = source.split(/\n+/),
      b = target.split(/\n+/);
    if (a.length === b.length)
      a.forEach((value, i) => register(value.replace(/^#+\s*/, ''), b[i].replace(/^#+\s*/, '')));
  }
  // Most specific templates first; a generic placeholder must not swallow a label.
  patterns.sort((a, b) => b.regex.source.length - a.regex.source.length);
}
function translate(text: string, depth = 0): string {
  const trimmed = text.trim();
  if (!trimmed || depth > 5) return text;
  let translated = exact.get(trimmed);
  if (translated === undefined)
    for (const entry of patterns) {
      const match = entry.regex.exec(trimmed);
      if (!match) continue;
      const values: Record<number, string> = {};
      entry.slots.forEach((slot, i) => (values[slot] = translate(match[i + 1], depth + 1)));
      translated = entry.target.replace(/\{(\d+)\}/g, (token, index) => values[index] ?? token);
      break;
    }
  return translated === undefined
    ? text
    : text.slice(0, text.indexOf(trimmed)) +
        translated +
        text.slice(text.indexOf(trimmed) + trimmed.length);
}
function update(node: Node, attr: string, value: string) {
  let records = originals.get(node);
  if (!records) {
    records = new Map();
    originals.set(node, records);
  }
  let record = records.get(attr);
  if (!record || record.rendered !== value) {
    record = { source: value, rendered: value };
    records.set(attr, record);
  }
  const next = translate(record.source);
  record.rendered = next;
  if (next !== value) {
    if (attr) (node as Element).setAttribute(attr, next);
    else node.nodeValue = next;
  }
}
function visit(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  if (!element || element.closest(protectedContent)) return;
  if (node.nodeType === Node.TEXT_NODE) {
    update(node, '', node.nodeValue ?? '');
    return;
  }
  if (node instanceof Element) {
    for (const attr of attributes) {
      const value = node.getAttribute(attr);
      if (value !== null) update(node, attr, value);
    }
  }
  for (const child of node.childNodes) visit(child);
}
// Only presentation labels are observed. Source, output, file names and input values
// remain untouched. No application state is reconstructed from the translated DOM.
const observer = new MutationObserver((records) => {
  const roots = new Set<Node>();
  for (const record of records) {
    if (record.type === 'childList') for (const node of record.addedNodes) roots.add(node);
    else roots.add(record.target);
  }
  for (const node of roots) {
    // A parent traversal already includes its children. Ignore removed subtrees.
    if (!node.isConnected) continue;
    let parent = node.parentNode;
    while (parent && !roots.has(parent)) parent = parent.parentNode;
    if (!parent) visit(node);
  }
});
export async function setLocale(next: Locale, persist = true) {
  const version = ++request;
  const catalog = next === 'ja' ? canonical : (await loaders[`./locales/${next}.json`]()).default;
  if (version !== request) return;
  engine.addResourceBundle(next, 'translation', catalog, true, true);
  await engine.changeLanguage(next);
  if (version !== request) return;
  locale = next;
  setDisplayCatalog(catalog);
  rebuild(catalog);
  document.documentElement.lang = next;
  if (persist)
    try {
      localStorage.setItem(storageKey, next);
    } catch {}
  observer.disconnect();
  visit(document.body);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: attributes,
  });
  renderBoundMessages();
  window.dispatchEvent(new CustomEvent('jaspera:locale', { detail: next }));
}
export function languageMenuItem() {
  return { id: 'language-settings', label: msg('language.menu'), action: openLanguageSettings };
}
export function openLanguageSettings() {
  const existing = document.querySelector<HTMLDialogElement>('#language-dialog');
  if (existing) {
    existing.focus();
    return;
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'language-dialog';
  dialog.setAttribute('aria-labelledby', 'language-title');
  const title = document.createElement('h2');
  title.id = 'language-title';
  title.textContent = msg('language.title');
  const label = document.createElement('label');
  label.htmlFor = 'language-select';
  label.textContent = msg('language.choose');
  const select = document.createElement('select');
  select.id = 'language-select';
  select.translate = false;
  for (const [code, name] of Object.entries(locales)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    option.lang = code;
    select.append(option);
  }
  select.value = locale;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const close = document.createElement('button');
  close.textContent = msg('language.close');
  close.onclick = () => dialog.close();
  const apply = document.createElement('button');
  apply.textContent = msg('language.apply');
  apply.onclick = async () => {
    apply.disabled = true;
    status.textContent = msg('language.loading');
    try {
      await setLocale(select.value as Locale);
      dialog.close();
    } catch {
      status.textContent = msg('language.error');
    } finally {
      apply.disabled = false;
    }
  };
  actions.append(close, apply);
  dialog.append(title, label, select, status, actions);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  visit(dialog);
  dialog.showModal();
  select.focus();
}
export function preferredLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (base in locales) return base as Locale;
  }
  return 'en';
}
function savedLocale(): Locale {
  try {
    const value = localStorage.getItem(storageKey);
    if (value && value in locales) return value as Locale;
  } catch {}
  return preferredLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}
window.addEventListener('storage', (event) => {
  if (event.key === storageKey) void setLocale(savedLocale(), false).catch(() => {});
});
function start() {
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: attributes,
  });
  void setLocale(savedLocale(), false).catch(() => {});
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
