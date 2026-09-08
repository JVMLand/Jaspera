import { msg } from './messages.js';
import type { Item } from './menus';
export function editMenuItems(action: (id: string) => void): (Item | null)[] {
  return [
    { id: 'undo', label: msg('mdc65bd3603e8'), shortcut: 'Ctrl+Z', action: () => action('undo') },
    { id: 'redo', label: msg('mbb9965eed1aa'), shortcut: 'Ctrl+Y', action: () => action('redo') },
    null,
    {
      id: 'find',
      label: msg('m977ece7f418a'),
      shortcut: 'Ctrl+F',
      action: () => action('actions.find'),
    },
    {
      id: 'replace',
      label: msg('mfd481a97d712'),
      shortcut: 'Ctrl+H',
      action: () => action('editor.action.startFindReplaceAction'),
    },
    null,
    {
      id: 'format',
      label: msg('m50f9e220e47b'),
      shortcut: 'Shift+Alt+F',
      action: () => action('editor.action.formatDocument'),
    },
    {
      id: 'comment',
      label: msg('m577631e74dec'),
      shortcut: 'Ctrl+/',
      action: () => action('editor.action.commentLine'),
    },
    {
      id: 'quick-fix',
      label: msg('mba6e41c7bd6d'),
      shortcut: 'Ctrl+.',
      action: () => action('editor.action.quickFix'),
    },
  ];
}
