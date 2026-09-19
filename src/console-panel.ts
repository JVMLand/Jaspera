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
      {
        label: msg('common.copySelection'),
        disabled: !selection,
        action: () => copyText(selection),
      },
      { label: msg('editor.copyAllOutput'), disabled: !text, action: () => copyText(text) },
      {
        label: msg('editor.selectAllOutput'),
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
      { label: msg('editor.clearConsole'), disabled: !text, action: clear },
    ];
  });
}
