import { bindMessage } from './localization';
import { displayMessage } from './messages.js';
import './help-manual.css';

// Authored HTML only. Do not interpolate source code or user input into these pages.
const topics = [
  { id: 'start', title: 'mf2c1ac698335', body: 'm7b8bfb66b6a4' },
  { id: 'editor', title: 'mbea671dc0594', body: 'm2181264bd49b' },
  { id: 'instructions', title: 'm50d9f8ab33a3', body: 'me9b789cbc18a' },
  { id: 'debug', title: 'm917477fade5d', body: 'mbb71c6101eac' },
  { id: 'graph', title: 'ma3cd8c2dab66', body: 'm2dc130c433c9' },
  { id: 'navigation', title: 'm24e2f91257a1', body: 'mab41ecfbaa24' },
  { id: 'files', title: 'maa2b06054043', body: 'maa27985d5312' },
  { id: 'layout', title: 'm43933e6544cd', body: 'm4caec0734b09' },
  { id: 'shortcuts', title: 'mb9c4ebcabaed', body: 'm884b8b3a0c56' },
  { id: 'offline', title: 'm408ca64b49fa', body: 'mb41492e32e40' },
] as const;

export function openFeatureManual() {
  const existing = document.querySelector<HTMLDialogElement>('#feature-manual');
  if (existing) {
    if (!existing.open) existing.showModal();
    return;
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'feature-manual';
  dialog.translate = false;
  dialog.setAttribute('aria-labelledby', 'feature-manual-title');
  dialog.innerHTML = displayMessage('m87baf503d827');
  const nav = dialog.querySelector('nav')!,
    article = dialog.querySelector('article')!;
  for (const topic of topics) {
    const button = document.createElement('button');
    button.type = 'button';
    bindMessage(button, topic.title);
    button.onclick = () => {
      for (const item of nav.querySelectorAll('button')) item.removeAttribute('aria-current');
      button.setAttribute('aria-current', 'page');
      const title = document.createElement('h2');
      title.id = 'manual-topic-title';
      title.textContent = displayMessage(topic.title);
      article.replaceChildren(title);
      article.insertAdjacentHTML('beforeend', displayMessage(topic.body));
      article.scrollTop = 0;
    };
    nav.append(button);
  }
  nav.querySelector('button')!.click();
  dialog.querySelector<HTMLButtonElement>('.manual-close')!.onclick = () => dialog.close();
  const languageChanged = () => {
    const shell = document.createElement('template');
    shell.innerHTML = displayMessage('m87baf503d827');
    dialog.querySelector('header')!.replaceWith(shell.content.querySelector('header')!);
    nav.setAttribute('aria-label', shell.content.querySelector('nav')!.getAttribute('aria-label')!);
    dialog.querySelector<HTMLButtonElement>('.manual-close')!.onclick = () => dialog.close();
    nav.querySelector<HTMLButtonElement>('[aria-current]')?.click();
  };
  window.addEventListener('jaspera:locale', languageChanged);
  dialog.addEventListener(
    'close',
    () => {
      window.removeEventListener('jaspera:locale', languageChanged);
      dialog.remove();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  nav.querySelector('button')!.focus();
}
