import { msg, displayMessage, displayText } from './messages.js';
import { bindTranslation } from './localization';
import { installContextMenu, type ContextItem } from './context-menu';
import { paneDrag } from './tab-interactions';
import { layoutPanels, type LayoutPanel } from './workspace-layout';
export function paneIdentity(
  key: string,
): { kind: 'editor'; key: string } | { kind: 'tool'; key: string; name: LayoutPanel } | undefined {
  if (
    (key.startsWith('source:') && key.length > 7) ||
    (key.startsWith('preview:') && key.length > 8)
  )
    return { kind: 'editor', key };
  const name = key.slice(6) as LayoutPanel;
  if (key.startsWith('panel:') && layoutPanels.includes(name)) return { kind: 'tool', key, name };
}
interface PaneActions {
  select: () => void;
  close: (others: boolean) => void;
}
// A pane owns its content; both hosts use this common tab and lifecycle contract.
export abstract class Pane {
  abstract readonly kind: 'editor' | 'tool';
  constructor(
    readonly key: string,
    readonly title: string,
    private actions: PaneActions,
  ) {}
  contextItems(): ContextItem[] {
    return [
      { label: msg('m75b77204a6c9'), action: () => this.close() },
      { label: msg('mad5f178303ff'), action: () => this.close(true) },
    ];
  }
  select() {
    this.actions.select();
  }
  close(others = false) {
    this.actions.close(others);
  }
}
export class EditorPane extends Pane {
  readonly kind = 'editor' as const;
}
export class ToolPane extends Pane {
  readonly kind = 'tool' as const;
  constructor(
    readonly name: LayoutPanel,
    title: string,
    actions: PaneActions,
  ) {
    super('panel:' + name, title, actions);
  }
}
export function paneTab(
  pane: Pane,
  workspace: string,
  selected: boolean,
  button?: HTMLElement,
  label = pane.title,
) {
  const wrapper = document.createElement('div');
  wrapper.className = button ? 'dock-tab' : 'editor-tab';
  wrapper.dataset.paneKey = pane.key;
  wrapper.dataset.paneKind = pane.kind;
  wrapper.setAttribute('role', 'presentation');
  if (pane.kind === 'editor') wrapper.dataset.tabKey = pane.key;
  else wrapper.dataset.panel = pane.key.slice(6);
  const tab = button ?? document.createElement('button');
  tab.classList.add(button ? 'dock-tab-button' : 'file-tab');
  if (!button) tab.textContent = label;
  bindTranslation(tab, () => {
    if (!button) tab.textContent = pane.kind === 'tool' ? displayText(label) : label;
    else if (pane.kind === 'tool') {
      const text = [...tab.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (text) text.textContent = displayText(label) + (tab.children.length ? ' ' : '');
    }
    tab.title =
      (pane.kind === 'tool' ? displayText(pane.title) : pane.title) +
      displayMessage('md7e0aafb1eb8');
  });
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', String(selected));
  tab.tabIndex = selected ? 0 : -1;
  installContextMenu(tab, () => pane.contextItems());
  tab.onclick = (e) => {
    e.altKey ? pane.close(true) : pane.select();
  };
  paneDrag(tab, workspace, pane.key);
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'Delete') {
      e.preventDefault();
      pane.close();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const tabs = [...wrapper.parentElement!.querySelectorAll<HTMLElement>('[role=tab]')].filter(
        (t) => !t.closest('[hidden]'),
      ),
      i = tabs.indexOf(tab),
      at =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? tabs.length - 1
            : (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    tabs[at]?.click();
    tabs[at]?.focus();
  });
  const close = document.createElement('button');
  close.className = button ? 'dock-tab-close' : 'tab-close';
  close.textContent = '×';
  bindTranslation(close, () => {
    close.setAttribute(
      'aria-label',
      (pane.kind === 'tool' ? displayText(pane.title) : pane.title) +
        displayMessage('m9523f5ce6ba6'),
    );
    close.title = displayMessage('m60a3d26b433c');
  });
  close.onclick = (e) => pane.close(e.altKey);
  wrapper.append(tab, close);
  return { wrapper, button: tab };
}
export function beforePane(strip: HTMLElement, key: string, x: number) {
  return [...strip.querySelectorAll<HTMLElement>('[data-pane-key]')].find(
    (n) =>
      n.dataset.paneKey !== key &&
      !n.hidden &&
      x < n.getBoundingClientRect().left + n.offsetWidth / 2,
  )?.dataset.paneKey;
}
export function movePaneOrder(order: string[], key: string, before?: string) {
  const at = order.indexOf(key);
  if (at >= 0) order.splice(at, 1);
  const target = before ? order.indexOf(before) : -1;
  order.splice(target < 0 ? order.length : target, 0, key);
}
export function arrangePaneTabs(strip: HTMLElement, order: string[]) {
  const tabs = [...strip.querySelectorAll<HTMLElement>(':scope > [data-pane-key]')];
  for (const tab of tabs)
    if (!order.includes(tab.dataset.paneKey!)) order.push(tab.dataset.paneKey!);
  tabs.sort((a, b) => order.indexOf(a.dataset.paneKey!) - order.indexOf(b.dataset.paneKey!));
  for (const tab of tabs) strip.append(tab);
}
