import notices from '../THIRD_PARTY_NOTICES.md?raw';
import { bindMessage } from './localization';
import { displayMessage as msg } from './messages.js';
import './licenses.css';

// These files are also available without JavaScript and included in the offline cache.
export const licenseFiles = [
  'ANTLR',
  'ASM',
  'Bovine-JVM',
  'Comlink',
  'Darcula',
  'ELK',
  'Floating-UI',
  'Javasm',
  'JZlib',
  'LangJAL',
  'Monaco',
  'OpenJDK',
  'OpenJDK-classpath-exception',
  'UDEV-Gothic',
  'Workbox',
  'fflate',
  'i18next',
];

export function openLicenses() {
  const existing = document.querySelector<HTMLDialogElement>('#licenses-dialog');
  if (existing) {
    existing.focus();
    return;
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'licenses-dialog';
  dialog.setAttribute('aria-labelledby', 'licenses-title');
  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.id = 'licenses-title';
  bindMessage(title, 'help.licenses.title');
  const close = document.createElement('button');
  bindMessage(close, 'mf6c244f98893');
  close.onclick = () => dialog.close();
  header.append(title, close);
  const layout = document.createElement('div');
  layout.className = 'licenses-layout';
  const nav = document.createElement('nav');
  const body = document.createElement('pre');
  body.tabIndex = 0;
  body.translate = false;
  body.setAttribute('aria-live', 'polite');
  layout.append(nav, body);
  dialog.append(header, layout);
  let request: AbortController | undefined;
  const cache = new Map<string, string>();
  function select(button: HTMLButtonElement) {
    nav.querySelectorAll('button').forEach((b) => b.removeAttribute('aria-current'));
    button.setAttribute('aria-current', 'true');
    body.scrollTop = 0;
  }
  const summary = document.createElement('button');
  bindMessage(summary, 'help.licenses.notices');
  summary.onclick = () => {
    request?.abort();
    select(summary);
    body.textContent = notices;
  };
  nav.append(summary);
  for (const name of licenseFiles) {
    const button = document.createElement('button');
    button.textContent = name;
    button.translate = false;
    button.onclick = async () => {
      request?.abort();
      const current = new AbortController();
      request = current;
      select(button);
      body.textContent = cache.get(name) ?? msg('help.licenses.loading');
      if (cache.has(name)) return;
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}licenses/${name}.txt`, {
          signal: current.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const text = await response.text();
        if (current.signal.aborted) return;
        cache.set(name, text);
        body.textContent = text;
      } catch {
        if (!current.signal.aborted) body.textContent = msg('help.licenses.error');
      }
    };
    nav.append(button);
  }
  dialog.addEventListener(
    'close',
    () => {
      request?.abort();
      dialog.remove();
    },
    { once: true },
  );
  document.body.append(dialog);
  summary.click();
  dialog.showModal();
}
