import { msg } from './messages.js';
import './context-menu.css';
export type ContextItem = { label: string; action: () => void; disabled?: boolean } | null;
let dismissActive: (() => void) | undefined;
export function showContextMenu(items: ContextItem[], x: number, y: number, owner: HTMLElement) {
  dismissActive?.();
  const menu = document.createElement('div');
  menu.className = 'panel-context-menu';
  menu.setAttribute('role', 'menu');
  menu.tabIndex = -1;
  const previous = document.activeElement as HTMLElement | null;
  const close = (restore = false) => {
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('blur', blur);
    window.removeEventListener('resize', blur);
    if (dismissActive === blur) dismissActive = undefined;
    if (restore) (previous?.isConnected ? previous : owner).focus();
  };
  const blur = () => close();
  const outside = (e: PointerEvent) => {
    if (!menu.contains(e.target as Node)) close();
  };
  for (const item of items) {
    if (!item) {
      const hr = document.createElement('hr');
      hr.setAttribute('role', 'separator');
      menu.append(hr);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = item.label;
    button.disabled = !!item.disabled;
    button.onclick = () => {
      close(true);
      item.action();
    };
    menu.append(button);
  }
  if (!menu.childElementCount) return;
  menu.onkeydown = (e) => {
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      buttons[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? buttons.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
      ]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }
  };
  document.body.append(menu);
  menu.style.left = Math.max(4, Math.min(x, innerWidth - menu.offsetWidth - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - menu.offsetHeight - 4)) + 'px';
  (menu.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? menu).focus();
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('blur', blur);
  window.addEventListener('resize', blur);
  dismissActive = blur;
  return blur;
}
export function installContextMenu(
  host: HTMLElement,
  items: (target: HTMLElement) => ContextItem[],
) {
  let close: (() => void) | undefined;
  const show = (e: MouseEvent | KeyboardEvent) => {
    const target = e.target instanceof HTMLElement ? e.target : host;
    if (target.closest('input,textarea,select,[contenteditable=true]')) return;
    const rows = items(target);
    if (!rows.length) return;
    e.preventDefault();
    e.stopPropagation();
    const box = target.getBoundingClientRect();
    close = showContextMenu(
      rows,
      e instanceof MouseEvent && e.button === 2 ? e.clientX : box.left,
      e instanceof MouseEvent && e.button === 2 ? e.clientY : box.bottom,
      host,
    );
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) show(e);
  };
  host.addEventListener('contextmenu', show);
  host.addEventListener('keydown', key);
  return {
    dispose() {
      close?.();
      host.removeEventListener('contextmenu', show);
      host.removeEventListener('keydown', key);
    },
  };
}
export function selectedText(host: HTMLElement) {
  const selection = window.getSelection();
  return selection?.anchorNode &&
    selection.focusNode &&
    host.contains(selection.anchorNode) &&
    host.contains(selection.focusNode)
    ? selection.toString()
    : '';
}
export function copyText(text: string) {
  void navigator.clipboard.writeText(text).catch(() => {
    const dialog = document.createElement('dialog'),
      input = document.createElement('textarea'),
      close = document.createElement('button');
    input.value = text;
    input.readOnly = true;
    input.setAttribute('aria-label', msg('meb8927b82c0b'));
    close.textContent = msg('mf6c244f98893');
    close.onclick = () => dialog.close();
    dialog.onclose = () => dialog.remove();
    dialog.append(input, close);
    document.body.append(dialog);
    dialog.showModal();
    input.select();
  });
}
