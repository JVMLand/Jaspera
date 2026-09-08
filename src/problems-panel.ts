import { installContextMenu, copyText } from './context-menu';
export function installProblemsContextMenu(host: HTMLElement) {
  return installContextMenu(host, (target) => {
    const item = target.closest<HTMLButtonElement>('li button'),
      rows = [...host.querySelectorAll<HTMLButtonElement>('li button')];
    return [
      ...(item
        ? [
            { label: 'ソースへ移動', action: () => item.click() },
            { label: 'この問題をコピー', action: () => copyText(item.textContent ?? '') },
            null,
          ]
        : []),
      {
        label: '問題をすべてコピー',
        disabled: !rows.length,
        action: () => copyText(rows.map((row) => row.textContent).join('\n')),
      },
    ];
  });
}
