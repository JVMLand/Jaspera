import { msg } from './messages.js';
import { installContextMenu, copyText } from './context-menu';
export function installProblemsContextMenu(host: HTMLElement) {
  return installContextMenu(host, (target) => {
    const item = target.closest<HTMLButtonElement>('li button'),
      rows = [...host.querySelectorAll<HTMLButtonElement>('li button')];
    return [
      ...(item
        ? [
            { label: msg('md3bed236948a'), action: () => item.click() },
            { label: msg('m1e6645c063cf'), action: () => copyText(item.textContent ?? '') },
            null,
          ]
        : []),
      {
        label: msg('m473035efc46f'),
        disabled: !rows.length,
        action: () => copyText(rows.map((row) => row.textContent).join('\n')),
      },
    ];
  });
}
