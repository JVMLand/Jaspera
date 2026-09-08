import type { Item } from './menus';

// Shared by the workspace and detached windows. Each row is a related operation group.
const groups: Record<string, string[][]> = {
  File: [
    ['save-project', 'open-files', 'open-workspace-file', 'new-file', 'close-tab', 'close-others'],
    ['open-project', 'new-project', 'rename-file', 'project-properties-menu'],
    ['save-project-as', 'save-file-as', 'save-class-source', 'download-jar', 'export-project'],
    ['close-jar', 'remove-file', 'close-window'],
  ],
  Edit: [
    ['undo', 'redo'],
    ['find', 'replace'],
    ['format', 'comment', 'quick-fix'],
  ],
  View: [
    [
      'show-console',
      'show-problems',
      'show-instructions',
      'show-debug',
      'show-graph',
      'show-project',
    ],
    ['wrap', 'text-size-settings', 'presentation-mode', 'swap-panes'],
    ['theme-settings', 'theme', 'language-settings'],
  ],
  Build: [['menu-run', 'check-project', 'check'], ['download']],
  Debug: [
    ['debug-continue', 'debug-over', 'debug-into', 'debug-out'],
    ['debug-pause', 'debug-stop', 'debug-start'],
    ['debug-ignore-breakpoints'],
  ],
  Help: [
    ['help-manual', 'help-language-docs'],
    ['help-offline', 'help-guides'],
    ['help-about', 'help-langjal', 'help-licenses'],
  ],
};

export function orderMenuItems(name: string, items: (Item | null)[]): (Item | null)[] {
  const order = groups[name];
  if (!order) return items;
  const remaining = new Map(
    items.filter((item): item is Item => item !== null).map((item) => [item.id, item]),
  );
  const result: (Item | null)[] = [];
  for (const group of [
    ...order,
    [...remaining.keys()].filter((id) => !order.flat().includes(id)),
  ]) {
    const found = group.flatMap((id) => {
      const item = remaining.get(id);
      if (!item) return [];
      remaining.delete(id);
      return [item];
    });
    if (!found.length) continue;
    if (result.length) result.push(null);
    result.push(...found);
  }
  return result;
}
