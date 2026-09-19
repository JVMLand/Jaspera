import { msg } from './messages.ts';
import type { Item } from './menus';
export function editMenuItems(action: (id: string) => void): (Item | null)[] {
  return [
    { id: 'undo', label: msg('editor.undo'), shortcut: 'Ctrl+Z', action: () => action('undo') },
    { id: 'redo', label: msg('editor.redo'), shortcut: 'Ctrl+Y', action: () => action('redo') },
    null,
    {
      id: 'find',
      label: msg('editor.find'),
      shortcut: 'Ctrl+F',
      action: () => action('actions.find'),
    },
    {
      id: 'replace',
      label: msg('editor.replace'),
      shortcut: 'Ctrl+H',
      action: () => action('editor.action.startFindReplaceAction'),
    },
    null,
    {
      id: 'format',
      label: msg('editor.formatCode'),
      shortcut: 'Shift+Alt+F',
      action: () => action('editor.action.formatDocument'),
    },
    {
      id: 'comment',
      label: msg('editor.toggleComment'),
      shortcut: 'Ctrl+/',
      action: () => action('editor.action.commentLine'),
    },
    {
      id: 'quick-fix',
      label: msg('editor.quickFix'),
      shortcut: 'Ctrl+.',
      action: () => action('editor.action.quickFix'),
    },
  ];
}
