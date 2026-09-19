import { msg } from './messages.js';
import { installContextMenu, copyText } from './context-menu';
export function installProblemsContextMenu(host: HTMLElement) {
  return installContextMenu(host, (target) => {
    const item = target.closest<HTMLButtonElement>('li button'),
      rows = [...host.querySelectorAll<HTMLButtonElement>('li button')];
    return [
      ...(item
        ? [
            { label: msg('editor.goToSource'), action: () => item.click() },
            {
              label: msg('editor.copyThisProblem'),
              action: () => copyText(item.textContent ?? ''),
            },
            null,
          ]
        : []),
      {
        label: msg('editor.copyAllProblems'),
        disabled: !rows.length,
        action: () => copyText(rows.map((row) => row.textContent).join('\n')),
      },
    ];
  });
}
