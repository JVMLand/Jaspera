import { msg } from './messages.js';
import { fileLabel } from './file-labels';
import { installContextMenu, copyText } from './context-menu';
import { paneDrag } from './tab-interactions';
export interface ProjectTreeActions {
  create: (directory: string) => void;
  rename: (path: string, folder: boolean) => void;
  move: (path: string, folder: boolean) => void;
}
const contexts = new WeakMap<HTMLElement, { host: HTMLElement; actions?: ProjectTreeActions }>();
export interface TreeFile {
  path: string;
  key: string;
  active?: boolean;
  open: () => void;
}
export function renderProjectTree(
  host: HTMLElement,
  files: TreeFile[],
  workspace: string,
  collapsed = new Set<string>(),
  actions?: ProjectTreeActions,
) {
  const surface = host.closest<HTMLElement>('#project-panel,#popup-project') ?? host;
  if (!contexts.has(surface))
    installContextMenu(surface, () => {
      const current = contexts.get(surface)!;
      return [
        ...(current.actions
          ? [{ label: msg('md3a91edcf75f'), action: () => current.actions!.create('src') }, null]
          : []),
        {
          label: msg('m127ced042f4f'),
          action: () => {
            for (const folder of current.host.querySelectorAll<HTMLDetailsElement>('details'))
              folder.open = true;
          },
        },
        {
          label: msg('mf4fe505d5480'),
          action: () => {
            for (const folder of current.host.querySelectorAll<HTMLDetailsElement>('details'))
              folder.open = false;
          },
        },
      ];
    });
  contexts.set(surface, { host, actions });
  const editable = (path: string) => {
    const children = files.filter((f) => f.path.startsWith(path + '/'));
    return children.length > 0 && children.every((f) => f.key.startsWith('source:'));
  };
  const operations = (path: string, folder: boolean) =>
    actions &&
    (folder ? editable(path) : files.some((f) => f.path === path && f.key.startsWith('source:')))
      ? [
          {
            label: msg('md3a91edcf75f'),
            action: () => actions.create(folder ? path : path.split('/').slice(0, -1).join('/')),
          },
          null,
          { label: msg('m845f8265321f'), action: () => actions.rename(path, folder) },
          { label: msg('m7d2242b95abd'), action: () => actions.move(path, folder) },
          null,
        ]
      : [];
  type Node = { folders: Map<string, Node>; files: TreeFile[] };
  const root: Node = { folders: new Map(), files: [] };
  host.replaceChildren();
  for (const file of files) {
    const parts = file.path.split('/');
    parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] });
      node = node.folders.get(part)!;
    }
    node.files.push(file);
  }
  const render = (node: Node, parent: HTMLElement, prefix: string) => {
    for (const [name, child] of [...node.folders].sort(([a], [b]) => a.localeCompare(b))) {
      const path = prefix + name,
        details = document.createElement('details'),
        summary = document.createElement('summary'),
        children = document.createElement('div');
      details.className = 'file-folder';
      details.open = !collapsed.has(path);
      summary.textContent = name;
      summary.title = path;
      installContextMenu(summary, () => [
        ...operations(path, true),
        {
          label: details.open ? msg('m8ab5d1f1fa80') : msg('m5dfc8ef53b28'),
          action: () => {
            details.open = !details.open;
          },
        },
        { label: msg('m87d17ab9caf9'), action: () => copyText(path) },
      ]);
      children.className = 'folder-children';
      details.append(summary, children);
      parent.append(details);
      render(child, children, path + '/');
      details.ontoggle = () => {
        if (details.isConnected) {
          if (details.open) collapsed.delete(path);
          else collapsed.add(path);
        }
      };
    }
    for (const file of node.files.sort((a, b) => a.path.localeCompare(b.path))) {
      const button = document.createElement('button');
      button.textContent = fileLabel(file.path);
      button.title = file.path;
      button.className = file.active ? 'selected' : '';
      button.setAttribute('aria-current', String(!!file.active));
      button.onclick = file.open;
      installContextMenu(button, () => [
        { label: msg('m3aa692fcaae4'), action: file.open },
        ...operations(file.path, false),
        { label: msg('m87d17ab9caf9'), action: () => copyText(file.path) },
      ]);
      if (file.key) paneDrag(button, workspace, file.key);
      parent.append(button);
    }
  };
  render(root, host, '');
}
