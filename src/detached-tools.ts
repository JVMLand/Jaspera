import { msg } from './messages.js';
import { installDebugPanel } from './debug-panel';
import type { DebugState } from './debug-protocol';
import { installInstructionGraph } from './lazy-instruction-graph';
import type { GraphDocument } from './protocol';
import { installConsoleContextMenu } from './console-panel';
import { installProblemsContextMenu } from './problems-panel';
import { ToolPane, paneTab } from './pane';
import { renderProjectTree } from './project-tree';
import { installInstructionsPanel } from './lazy-instructions-panel';
import type { PanelName } from './panel-dock';
import type { DetachedBridge, ToolState, DetachedState } from './detached-host';
import './detached-tools.css';
export function installDetachedTools(
  bridge: DetachedBridge | undefined,
  group: string,
  onChange: () => void,
) {
  const names = new Set<PanelName>();
  let active: PanelName | undefined, last: ToolState | undefined;
  const container = document.createElement('section');
  container.className = 'detached-tools';
  container.hidden = true;
  container.innerHTML = msg('m13181c191a75');
  document.body.append(container);
  const get = (id: string) => container.querySelector<HTMLElement>('#' + id)!;
  const collapsed = new Set<string>();
  let lastFiles: DetachedState['files'] | undefined;
  const panels = {
    project: get('popup-project'),
    console: get('popup-console'),
    problems: get('popup-problems'),
    instructions: get('instructions-panel'),
    graph: get('graph-panel'),
    debug: get('debug-panel'),
  };
  const debuggerPanel = installDebugPanel(panels.debug, {
    start: () => bridge?.debugStart(),
    command: (c) => bridge?.debugCommand(c),
    stop: () => bridge?.stop(),
    reveal: (f) => bridge?.debugReveal(f),
  });
  const instructions = installInstructionsPanel(panels.instructions, (source) =>
    bridge ? bridge.compileUsage(source) : Promise.reject(new Error(msg('md8e230ba93da'))),
  );
  const graph = installInstructionGraph(
    panels.graph,
    (doc, onProgress) =>
      bridge
        ? bridge.graphCompilation(doc, onProgress)
        : Promise.reject(new Error(msg('md8e230ba93da'))),
    (doc, line, column) => bridge?.graphNavigate(doc, line, column),
  );
  const contexts = [
    installConsoleContextMenu(panels.console, get('popup-output'), () => bridge?.clearOutput()),
    installProblemsContextMenu(panels.problems),
  ];
  const input = get('popup-stdin') as HTMLTextAreaElement;
  input.oninput = () => bridge?.stdin(input.value);
  get('popup-clear').onclick = () => bridge?.clearOutput();
  function refresh() {
    container.hidden = !active;
    document.getElementById('editor')!.hidden = !!active;
    for (const name of [
      'project',
      'console',
      'problems',
      'instructions',
      'graph',
      'debug',
    ] as const)
      panels[name].hidden = name !== active;
    onChange();
  }
  const api = {
    get active() {
      return active;
    },
    showInstruction(op: string) {
      instructions.showInstruction(op);
    },
    show(name: PanelName) {
      names.add(name);
      active = name;
      refresh();
    },
    remove(name: PanelName) {
      names.delete(name);
      if (active === name) active = [...names][0];
      refresh();
    },
    showSource() {
      active = undefined;
      refresh();
    },
    closeOthers(name?: PanelName) {
      for (const other of [...names]) if (other !== name) bridge?.closePanel(group, other);
    },
    renderTabs(strip: HTMLElement, closeEditors: () => void) {
      for (const name of names) {
        const pane = new ToolPane(name, name[0].toUpperCase() + name.slice(1), {
          select: () => api.show(name),
          close: (others) => {
            if (others) {
              api.closeOthers(name);
              closeEditors();
              api.show(name);
            } else bridge?.closePanel(group, name);
          },
        });
        if (name === 'project') {
          const items = pane.contextItems.bind(pane);
          pane.contextItems = () => [
            {
              label: msg('md3a91edcf75f'),
              action: () => bridge?.projectAction('create', 'src', true),
            },
            null,
            ...items(),
          ];
        }
        strip.append(paneTab(pane, bridge?.workspaceId ?? '', active === name).wrapper);
      }
    },
    update(
      state?: ToolState,
      files: DetachedState['files'] = [],
      doc?: GraphDocument,
      debug?: DebugState,
    ) {
      debuggerPanel.update(debug);
      graph.update(doc);
      if (files !== lastFiles) {
        lastFiles = files;
        renderProjectTree(
          get('file-list'),
          files.map((file) => ({
            path: file.title,
            key: file.key,
            open: () => {
              const state = bridge?.openTab(group, file.key);
              if (state) bridge?.openDefinition(group, state.uri, { lineNumber: 1, column: 1 });
            },
          })),
          bridge?.workspaceId ?? '',
          collapsed,
          bridge
            ? {
                create: (path) => bridge.projectAction('create', path, true),
                rename: (path, folder) => bridge.projectAction('rename', path, folder),
                move: (path, folder) => bridge.projectAction('move', path, folder),
              }
            : undefined,
        );
      }
      if (!state) return;
      if (state === last) return;
      const previous = last;
      last = state;
      if (previous?.output !== state.output) {
        const output = get('popup-output');
        const prior = previous?.output ?? [];
        const append =
          prior.length <= state.output.length && prior.every((part, i) => part === state.output[i]);
        if (!append) output.replaceChildren();
        output.append(
          ...state.output.slice(append ? prior.length : 0).map((part) => {
            const span = document.createElement('span');
            span.className = part.stream;
            span.textContent = part.text;
            return span;
          }),
        );
        output.scrollTop = output.scrollHeight;
      }
      if (document.activeElement !== input) input.value = state.stdin;
      const problems = get('problems');
      if (previous?.problems !== state.problems)
        problems.replaceChildren(
          ...state.problems.map((item, index) => {
            const li = document.createElement('li'),
              b = document.createElement('button');
            b.textContent = item.label;
            b.className = item.severity;
            b.onclick = () => bridge?.problem(index, group);
            li.append(b);
            return li;
          }),
        );
      panels.problems.querySelector<HTMLElement>('.empty-problems')!.hidden =
        state.problems.length > 0;
    },
    dispose() {
      debuggerPanel.dispose();
      for (const context of contexts) context.dispose();
      instructions.dispose();
      graph.dispose();
      container.remove();
    },
  };
  return api;
}
