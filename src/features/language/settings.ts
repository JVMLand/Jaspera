import { locales, currentLocale, setLocale, type Locale } from '../../localization';
import { msg } from '../../messages.ts';
import { renderTemplate } from '../../i18n/template';
import template from './settings.html?raw';
import './settings.css';

export function openLanguageSettings() {
  const existing = document.querySelector<HTMLDialogElement>('#language-dialog');
  if (existing) {
    existing.focus();
    return;
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'language-dialog';
  dialog.setAttribute('aria-labelledby', 'language-title');
  dialog.innerHTML = renderTemplate(template);
  const select = dialog.querySelector<HTMLSelectElement>('#language-select')!;
  for (const [code, name] of Object.entries(locales)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    option.lang = code;
    select.append(option);
  }
  select.value = currentLocale();
  const status = dialog.querySelector<HTMLElement>('[role=status]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-action=close]')!;
  close.onclick = () => dialog.close();
  const apply = dialog.querySelector<HTMLButtonElement>('[data-action=apply]')!;
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
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  select.focus();
}
