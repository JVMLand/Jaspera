import type { Item } from './menus';
export function editMenuItems(action: (id: string) => void): (Item | null)[] {
  return [
    { id: 'undo', label: '元に戻す', shortcut: 'Ctrl+Z', action: () => action('undo') },
    { id: 'redo', label: 'やり直す', shortcut: 'Ctrl+Y', action: () => action('redo') },
    null,
    { id: 'find', label: '検索…', shortcut: 'Ctrl+F', action: () => action('actions.find') },
    {
      id: 'replace',
      label: '置換…',
      shortcut: 'Ctrl+H',
      action: () => action('editor.action.startFindReplaceAction'),
    },
    null,
    {
      id: 'format',
      label: 'コードを整形',
      shortcut: 'Shift+Alt+F',
      action: () => action('editor.action.formatDocument'),
    },
    {
      id: 'comment',
      label: 'コメントの切り替え',
      shortcut: 'Ctrl+/',
      action: () => action('editor.action.commentLine'),
    },
    {
      id: 'quick-fix',
      label: 'クイックフィックス…',
      shortcut: 'Ctrl+.',
      action: () => action('editor.action.quickFix'),
    },
  ];
}
