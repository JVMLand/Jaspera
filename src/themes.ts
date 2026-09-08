import { inlayHintColors } from './inlay-hint-style';
import './brand-themes.css';
import './vibe-theme.css';
import { instructionColorRules, instructionColors } from './instruction-colors';
import * as monaco from './editor-platform';
import darcula from './generated/darcula.json';
import { referenceThemes, editorTheme } from './reference-themes';
const key = 'jalweb.theme';
let currentTheme = 'jal-night';
const themeListeners = new Set<(id: string) => void>();
export const selectedTheme = () => currentTheme;
export function onThemeChange(listener: (id: string) => void) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}
export const themes = [
  { id: 'jal-night', label: 'JAL Night' },
  { id: 'darcula', label: 'Darcula' },
  { id: 'vs-dark', label: 'Visual Studio Dark' },
  { id: 'vs', label: 'Visual Studio Light' },
  { id: 'hc-black', label: 'High Contrast Dark' },
  { id: 'hc-light', label: 'High Contrast Light' },
  ...referenceThemes.map(({ id, label }) => ({ id, label })),
];
monaco.editor.defineTheme('darcula', {
  ...darcula,
  colors: { ...darcula.colors, ...inlayHintColors('#a4a3a3') },
  rules: [...darcula.rules, ...instructionColorRules('darcula')],
} as monaco.editor.IStandaloneThemeData);
const palettes: Record<string, string[]> = {
  darcula: [
    '#2b2b2b',
    '#3c3f41',
    '#515151',
    '#bbbbbb',
    '#a4a3a3',
    '#589df6',
    '#214283',
    '#365880',
    '#ffffff',
    '#ff6b68',
    '#ffc66d',
  ],
  'vs-dark': [
    '#1e1e1e',
    '#252526',
    '#454545',
    '#d4d4d4',
    '#a6a6a6',
    '#75beff',
    '#264f78',
    '#0e639c',
    '#ffffff',
    '#f48771',
    '#cca700',
  ],
  vs: [
    '#ffffff',
    '#f3f3f3',
    '#c8c8c8',
    '#333333',
    '#616161',
    '#005fb8',
    '#d6ebff',
    '#0067b8',
    '#ffffff',
    '#b52020',
    '#795e00',
  ],
  'hc-black': [
    '#000000',
    '#000000',
    '#ffffff',
    '#ffffff',
    '#ffffff',
    '#ffff00',
    '#004080',
    '#ffff00',
    '#000000',
    '#ff8f8f',
    '#ffff00',
  ],
  'hc-light': [
    '#ffffff',
    '#ffffff',
    '#000000',
    '#000000',
    '#292929',
    '#0000a0',
    '#cce8ff',
    '#0000a0',
    '#ffffff',
    '#a00000',
    '#705000',
  ],
};
for (const theme of referenceThemes) {
  palettes[theme.id] = theme.palette;
  const data = editorTheme(theme);
  monaco.editor.defineTheme(theme.id, {
    ...data,
    rules: [...data.rules, ...instructionColorRules(theme.id)],
  });
}
for (const id of ['vs', 'vs-dark', 'hc-black', 'hc-light'] as const)
  monaco.editor.defineTheme('jal-' + id, {
    base: id,
    inherit: true,
    rules: instructionColorRules(id),
    colors: inlayHintColors(palettes[id][4]),
  });
const variables = [
  'bg',
  'surface',
  'border',
  'text',
  'muted',
  'accent',
  'selection',
  'button',
  'on-button',
  'error',
  'warning',
];
export function applyTheme(id: string, save = true) {
  if (!themes.some((t) => t.id === id)) id = 'jal-night';
  const root = document.documentElement;
  root.dataset.theme = id;
  const family = id.split('-')[0];
  if (['vibe', 'denden', 'googol', 'entrance', 'tsukuba'].includes(family))
    root.dataset.themeFamily = family;
  else delete root.dataset.themeFamily;
  root.style.colorScheme =
    id === 'vs' || id === 'hc-light' || referenceThemes.some((t) => t.id === id && !t.dark)
      ? 'light'
      : 'dark';
  variables.forEach((v, i) => {
    const color = palettes[id]?.[i];
    if (color) root.style.setProperty('--theme-' + v, color);
    else root.style.removeProperty('--theme-' + v);
  });
  for (const [group, color] of Object.entries(instructionColors(id)))
    root.style.setProperty('--instruction-' + group, '#' + color);
  monaco.editor.setTheme(['vs', 'vs-dark', 'hc-black', 'hc-light'].includes(id) ? 'jal-' + id : id);
  if (save)
    try {
      localStorage.setItem(key, id);
    } catch {
      /* Theme remains usable when storage is unavailable. */
    }
  if (currentTheme !== id) {
    currentTheme = id;
    for (const listener of themeListeners) listener(id);
  }
  return id;
}
function savedTheme() {
  try {
    const id = localStorage.getItem(key);
    return themes.some((t) => t.id === id) ? id : undefined;
  } catch {
    return undefined;
  }
}
function preferredTheme() {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs';
}
export function restoreTheme() {
  return applyTheme(savedTheme() ?? preferredTheme(), false);
}
export function openThemePicker() {
  const dialog = document.getElementById('theme-dialog') as HTMLDialogElement;
  (document.getElementById('theme-select') as HTMLSelectElement).value = currentTheme;
  dialog.showModal();
  document.getElementById('theme-select')!.focus();
}
export function initializeThemes() {
  const select = document.getElementById('theme-select') as HTMLSelectElement;
  for (const t of themes) {
    const option = document.createElement('option');
    option.value = t.id;
    option.textContent = t.label;
    select.append(option);
  }
  const firstVisit = savedTheme() === undefined;
  select.value = restoreTheme();
  select.onchange = () => applyTheme(select.value);
  if (firstVisit) {
    applyTheme(select.value);
    queueMicrotask(openThemePicker);
  }
}
