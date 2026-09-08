import { msg } from './messages.js';
import { installContextMenu, copyText, selectedText } from './context-menu';
export function installConsoleContextMenu(
  host: HTMLElement,
  output: HTMLElement,
  clear: () => void,
) {
  return installContextMenu(host, () => {
    const selection = selectedText(output),
      text = output.textContent ?? '';
    return [
      { label: msg('mfb8317d857a1'), disabled: !selection, action: () => copyText(selection) },
      { label: msg('mae1918a75cb6'), disabled: !text, action: () => copyText(text) },
      {
        label: msg('md3418f06aa97'),
        disabled: !text,
        action: () => {
          const range = document.createRange();
          range.selectNodeContents(output);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        },
      },
      null,
      { label: msg('mafe907ab0c50'), disabled: !text, action: clear },
    ];
  });
}
