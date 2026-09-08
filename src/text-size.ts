import * as monaco from './editor-platform';
import { msg } from './messages.js';

const key = 'jaspera.text-size';
export const defaultTextSize = { editor: 15, ui: 14 };
export type TextSize = typeof defaultTextSize;
const limit = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
function read(): TextSize {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}');
    return { editor: limit(value.editor, 15, 10, 32), ui: limit(value.ui, 14, 10, 20) };
  } catch {
    return { ...defaultTextSize };
  }
}
let current = read();
export const textSize = () => ({ ...current });
function updateEditor(editor: monaco.editor.ICodeEditor) {
  editor.updateOptions({ fontSize: current.editor, lineHeight: Math.round(current.editor * 1.8) });
}
function apply() {
  document.documentElement.style.setProperty('--ui-font-scale', String(current.ui / 14));
  for (const editor of monaco.editor.getEditors()) updateEditor(editor);
  window.dispatchEvent(new Event('jaspera:text-size'));
}
export function setTextSize(value: TextSize) {
  current = { editor: limit(value.editor, 15, 10, 32), ui: limit(value.ui, 14, 10, 20) };
  try {
    localStorage.setItem(key, JSON.stringify(current));
  } catch {
    /* Session-only when storage is unavailable. */
  }
  apply();
}
monaco.editor.onDidCreateEditor(updateEditor);
window.addEventListener('storage', (event) => {
  if (event.key === key || event.key === null) {
    current = read();
    apply();
  }
});
apply();
export function textSizeMenuItem() {
  return {
    id: 'text-size-settings',
    label: msg('textSize.title'),
    action: () => {
      void import('./text-size-dialog').then(({ openTextSize }) => openTextSize());
    },
  };
}
