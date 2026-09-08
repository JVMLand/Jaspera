import { defaultTextSize, textSize, setTextSize, type TextSize } from './text-size';
import { msg } from './messages.js';
import './text-size-dialog.css';

export function openTextSize() {
  const existing = document.querySelector<HTMLDialogElement>('#text-size-dialog');
  if (existing) {
    existing.focus();
    return;
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'text-size-dialog';
  dialog.setAttribute('aria-labelledby', 'text-size-title');
  const title = document.createElement('h2');
  title.id = 'text-size-title';
  title.textContent = msg('textSize.title');
  dialog.append(title);
  const inputs = new Map<keyof TextSize, HTMLInputElement>();
  for (const [name, max] of [
    ['editor', 32],
    ['ui', 20],
  ] as const) {
    const label = document.createElement('label');
    label.htmlFor = `text-size-${name}`;
    const caption = document.createElement('span');
    caption.textContent = msg(name === 'editor' ? 'textSize.editor' : 'textSize.ui');
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.type = 'number';
    input.min = '10';
    input.max = String(max);
    input.step = '1';
    input.value = String(textSize()[name]);
    input.oninput = () => {
      if (input.validity.valid && input.value !== '')
        setTextSize({ ...textSize(), [name]: input.valueAsNumber });
    };
    input.onchange = () => {
      input.value = String(textSize()[name]);
    };
    inputs.set(name, input);
    label.append(caption, input, 'px');
    dialog.append(label);
  }
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const reset = document.createElement('button');
  reset.textContent = msg('textSize.reset');
  reset.onclick = () => setTextSize(defaultTextSize);
  const close = document.createElement('button');
  close.textContent = msg('mf6c244f98893');
  close.onclick = () => dialog.close();
  actions.append(reset, close);
  dialog.append(actions);
  const sync = () => {
    for (const [name, input] of inputs) input.value = String(textSize()[name]);
  };
  window.addEventListener('jaspera:text-size', sync);
  dialog.onclose = () => {
    window.removeEventListener('jaspera:text-size', sync);
    dialog.remove();
  };
  document.body.append(dialog);
  dialog.showModal();
}
