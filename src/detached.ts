import { codeFontFamily } from './fonts';
import { languageMenuItem } from './localization';
import { msg } from './messages.js';
import { revealEditorPosition } from './editor-reveal';
import { installFeatureGuides } from './feature-guides';
import { debugMenuItems, installDebugKeys } from './debug-panel';
import { installDebugEditor } from './debug-editor';
import { APP_NAME } from './brand';
import { installEditorCommands, installWindowCommands } from './editor-commands';
import { installSearchEverywhere } from './search-everywhere';
import { tabLabels } from './file-labels';
import { inlayHintOptions } from './inlay-hint-style';
import { editMenuItems } from './edit-menu';
import { installFilePicker } from './file-opening';
import { helpMenuItems, showHelpMessage } from './help';
import * as monaco from './editor-platform';
import { SourceAnalysis, showBytecodeOffsets } from './source-analysis';
import {
  EditorPane,
  paneTab,
  paneIdentity,
  beforePane,
  movePaneOrder,
  arrangePaneTabs,
} from './pane';
import type { WindowLayout } from './workspace-layout';
import type { FileView } from './project';
import { paneDrop, paneWindowExit } from './tab-interactions';
import { followInstructionClicks } from './instruction-click';
import { installDetachedTools } from './detached-tools';
import { installStackHover } from './stack-hover';
import { installDefinitionUI } from './navigation';
import { registerLanguage } from './language';
import { applyTheme } from './themes';
import { replaceText, type EditorSnapshot, type DetachedBridge } from './detached-host';
import { installMenus } from './menus';
import { themes } from './themes';
import type { DetachedState } from './detached-host';
import './style.css';
import './detached.css';
registerLanguage(() => bridge?.completionCatalog() ?? Promise.resolve({}));
const group = new URL(location.href).searchParams.get('editor') ?? '';
const bridge: DetachedBridge | undefined = window.opener?.jalwebDetached;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
interface Tab {
  state: EditorSnapshot;
  model: monaco.editor.ITextModel;
  view: monaco.editor.ICodeEditorViewState | null;
  savedView?: FileView;
}
const paneOrder: string[] = [];
const tabs = new Map<string, Tab>();
let active: string | undefined,
  applying = false,
  workspace: DetachedState = {
    tools: { output: [], stdin: '', problems: [] },
    canSave: false,
    running: false,
    status: '',
    theme: 'jal-night',
    files: [],
  };
const overlays = document.createElement('div');
overlays.id = 'editor-overlays';
document.body.append(overlays);
export const editor = monaco.editor.create(el('editor'), {
  inlayHints: inlayHintOptions,
  overflowWidgetsDomNode: overlays,
  automaticLayout: true,
  fontFamily: codeFontFamily,
  fontSize: 15,
  lineHeight: 27,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  tabSize: 2,
  fixedOverflowWidgets: true,
  lineNumbersMinChars: 10,
});
const stackHover = installStackHover(editor, (model) => {
  const tab = [...tabs.values()].find((t) => t.model === model);
  return tab && bridge
    ? bridge.compilation(tab.state.id, tab.state.version)
    : Promise.reject(new Error(msg('md8e230ba93da')));
});
const syncTheme = () => (overlays.className = editor.getDomNode()!.className);
const observer = new MutationObserver(syncTheme);
observer.observe(editor.getDomNode()!, { attributes: true, attributeFilter: ['class'] });
syncTheme();
let toolTabs: ReturnType<typeof installDetachedTools> | undefined;
const current = () => (!toolTabs?.active && active ? tabs.get(active) : undefined);
const sourceAnalysis = new SourceAnalysis(
  (model) => {
    if (current()?.model === model) showOffsets();
  },
  (model) => [...tabs.values()].some((t) => t.model === model && !t.state.readOnly),
);
function inspect(tab: Tab) {
  sourceAnalysis.schedule(tab.model);
}
function showOffsets() {
  showBytecodeOffsets(editor, sourceAnalysis.offsets(current()?.model ?? null));
}
function graphFocus() {
  const tab = current(),
    p = editor.getPosition();
  if (tab) bridge?.graphFocus(tab.state.id, p?.lineNumber ?? 1, p?.column ?? 1);
}
editor.onDidChangeCursorPosition(graphFocus);
editor.onDidFocusEditorText(graphFocus);
function select(id: string) {
  const old = current();
  toolTabs?.showSource();
  const next = tabs.get(id);
  if (!next) return;
  if (old) {
    old.view = editor.saveViewState();
    old.savedView = fileView();
  }
  active = id;
  editor.setModel(next.model);
  editor.updateOptions({ readOnly: next.state.readOnly });
  if (next.view) editor.restoreViewState(next.view);
  else if (next.savedView) {
    const v = next.savedView;
    editor.setPosition(next.model.validatePosition({ lineNumber: v.line, column: v.column }));
    editor.setScrollPosition({ scrollTop: v.scrollTop, scrollLeft: v.scrollLeft });
  }
  showOffsets();
  renderTabs();
  updateActions();
  graphFocus();
}
function fileView(): FileView {
  const p = editor.getPosition();
  return {
    line: p?.lineNumber ?? 1,
    column: p?.column ?? 1,
    scrollTop: Math.round(editor.getScrollTop()),
    scrollLeft: Math.round(editor.getScrollLeft()),
  };
}
function layout(): Pick<WindowLayout, 'active' | 'views' | 'wordWrap' | 'order'> {
  const views: Record<string, FileView> = Object.create(null);
  for (const [id, tab] of tabs) {
    if (id === active) tab.savedView = fileView();
    if (tab.savedView) views[tab.state.key] = tab.savedView;
  }
  return {
    order: [...paneOrder],
    active: toolTabs?.active
      ? 'panel:' + toolTabs.active
      : (tabs.get(active ?? '')?.state.key ?? ''),
    views,
    wordWrap: editor.getRawOptions().wordWrap === 'on',
  };
}
function restoreLayout(layout: WindowLayout) {
  paneOrder.splice(0, paneOrder.length, ...(layout.order ?? []));
  for (const tab of tabs.values()) tab.savedView = layout.views[tab.state.key];
  editor.updateOptions({ wordWrap: layout.wordWrap ? 'on' : 'off' });
  const tab =
    [...tabs.values()].find((t) => t.state.key === layout.active) ?? tabs.get(active ?? '');
  if (tab) {
    active = undefined;
    tab.view = null;
    select(tab.state.id);
  }
  if (layout.active.startsWith('panel:'))
    toolTabs?.show(layout.active.slice(6) as import('./panel-dock').PanelName);
}
function closeTab(id: string, others = false) {
  for (const key of [...tabs.keys()])
    if (others ? key !== id : key === id) bridge?.closeTab(group, key);
  if (others) select(id);
}
function renderTabs() {
  const labels = tabLabels(
    [...tabs.values()].map((tab) => ({ key: tab.state.key, path: tab.state.title })),
  );
  el('file-tabs').replaceChildren();
  for (const [id, tab] of tabs) {
    const pane = new EditorPane(tab.state.key, tab.state.title, {
      select: () => select(id),
      close: (others) => {
        if (others) toolTabs?.closeOthers();
        closeTab(id, others);
      },
    });
    el('file-tabs').append(
      paneTab(
        pane,
        bridge?.workspaceId ?? '',
        !toolTabs?.active && active === id,
        undefined,
        labels.get(tab.state.key),
      ).wrapper,
    );
  }
  toolTabs?.renderTabs(el('file-tabs'), () => {
    for (const id of [...tabs.keys()]) bridge?.closeTab(group, id);
  });
  arrangePaneTabs(el('file-tabs'), paneOrder);
}

function update(snapshot: EditorSnapshot) {
  let tab = tabs.get(snapshot.id);
  if (tab && tab.state.uri !== snapshot.uri) {
    const selected = active === snapshot.id,
      view = selected ? editor.saveViewState() : tab.view;
    const index = paneOrder.indexOf(tab.state.key);
    if (index >= 0) paneOrder[index] = snapshot.key;
    remove(snapshot.id);
    update(snapshot);
    tabs.get(snapshot.id)!.view = view;
    if (selected) select(snapshot.id);
    return;
  }
  if (!tab) {
    const model =
      monaco.editor.getModel(monaco.Uri.parse(snapshot.uri)) ??
      monaco.editor.createModel(snapshot.source, 'jal', monaco.Uri.parse(snapshot.uri));
    tab = { state: snapshot, model, view: null, savedView: snapshot.view };
    tabs.set(snapshot.id, tab);
    const entry = tab;
    model.onDidChangeContent(() => {
      inspect(entry);
      if (applying) return;
      const result = bridge?.edit(entry.state.id, entry.state.version, model.getValue());
      if (result) {
        update(result);
        graphFocus();
      }
    });
    inspect(tab);
    renderTabs();
  }
  tab.state = snapshot;
  applyTheme(snapshot.theme, false);
  if (tab.model.getValue() !== snapshot.source) {
    applying = true;
    replaceText(tab.model, snapshot.source);
    applying = false;
  }
  monaco.editor.setModelMarkers(tab.model, 'jal', snapshot.diagnostics);
  if (!active) select(snapshot.id);
  updateActions();
}
function remove(id: string) {
  const tab = tabs.get(id);
  if (!tab) return;
  const keys = [...tabs.keys()],
    at = keys.indexOf(id);
  tabs.delete(id);
  if (active === id) {
    editor.setModel(null);
    active = undefined;
  }
  tab.model.dispose();
  if (!active) {
    const next = [...tabs.keys()][Math.min(at, tabs.size - 1)];
    if (next) select(next);
  }
  renderTabs();
  updateActions();
}
function updateActions() {
  const tab = current();
  document.title = (toolTabs?.active ?? tab?.state.title ?? 'Editor') + ' — ' + APP_NAME;
  menus.hidden('save-project', !workspace.canSave);
  menus.disabled('download-jar', !workspace.canExportJar);
  menus.disabled('close-tab', !tab && !toolTabs?.active);
  menus.disabled('close-others', !tab || tabs.size < 2);
  menus.disabled('open-workspace-file', !workspace.files.length);
  for (const id of ['undo', 'redo', 'replace', 'format', 'comment', 'quick-fix'])
    menus.disabled(id, !tab || tab.state.readOnly);
  menus.disabled('save-file-as', !tab);
  menus.disabled('find', !tab);
  menus.disabled('download', !tab || tab.state.readOnly);
  const reason =
    workspace.runAvailability?.[tab?.state.uri ?? ''] ??
    workspace.runAvailability?.[tab ? 'project' : ''] ??
    '';
  menus.disabled('menu-run', !workspace.running && !!reason);
  menus.disabled('debug-start', workspace.running || !!reason);
  menus.label('menu-run', workspace.running ? msg('mca4d973c0b00') : msg('m77721d5dea60'));
}
const action = (id: string) => {
  editor.focus();
  editor.trigger('menu', id, undefined);
};
const save = () => {
  if (workspace.canSave) bridge?.save();
};
const run = () => bridge?.run(active);

function openFile() {
  const select = el<HTMLSelectElement>('workspace-files');
  select.replaceChildren();
  for (const file of workspace.files) {
    const option = document.createElement('option');
    option.value = file.key;
    option.textContent = file.title;
    select.append(option);
  }
  el<HTMLDialogElement>('open-file').showModal();
}
async function downloadClass() {
  if (!active) return;
  const result = await bridge?.classFile(active);
  if (!result) {
    showHelpMessage(msg('m610c9cb03faf'), msg('m2707c2791337'));
    return;
  }
  const bytes = Uint8Array.from(atob(result.bytecode), (c) => c.charCodeAt(0)),
    url = URL.createObjectURL(new Blob([bytes]));
  const a = document.createElement('a');
  a.href = url;
  a.download = result.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const filePicker = installFilePicker((files) => {
  void bridge?.openFiles(files, group);
});
const debugActions = {
  start: () => bridge?.debugStart(active),
  command: (c: import('./debug-protocol').DebugCommand) => bridge?.debugCommand(c),
  stop: () => bridge?.stop(),
  reveal: (f: import('./debug-protocol').DebugFrame) => bridge?.debugReveal(f),
};
const debugKeys = installDebugKeys(debugActions);
const debugEditor = installDebugEditor(
  editor,
  () => workspace.debug,
  (uri, line) => bridge?.toggleBreakpoint(uri, line),
  (name) => workspace.debug?.documents?.[name],
);
const menus = installMenus(el('menus'), [
  {
    label: 'File',
    items: [
      {
        id: 'open-files',
        label: msg('mba31551c9cbe'),
        shortcut: 'Ctrl+O',
        action: filePicker.open,
      },
      { id: 'open-workspace-file', label: msg('ma8538563e6b2'), action: openFile },
      { id: 'download-jar', label: msg('jar.download'), action: () => bridge?.exportJar() },
      null,
      { id: 'save-project', label: msg('ma3030bf8f16d'), shortcut: 'Ctrl+S', action: save },
      {
        id: 'save-file-as',
        label: msg('m55345dd68b3a'),
        action: () => {
          const tab = current();
          if (!tab) return;
          const url = URL.createObjectURL(
              new Blob([tab.model.getValue()], { type: 'text/plain;charset=utf-8' }),
            ),
            a = document.createElement('a');
          a.href = url;
          a.download = tab.state.title
            .replace(/ \(JAL\)$/, '')
            .replace(/\.class$/i, '.jal')
            .split('/')
            .pop()!;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
      },
      null,
      {
        id: 'close-tab',
        label: msg('m75b77204a6c9'),
        action: () => {
          if (toolTabs?.active) bridge?.closePanel(group, toolTabs.active);
          else if (active) closeTab(active);
        },
      },
      {
        id: 'close-others',
        label: msg('mad5f178303ff'),
        action: () => {
          if (active) closeTab(active, true);
        },
      },
      { id: 'close-window', label: msg('m286b5f7afa80'), action: () => window.close() },
    ],
  },
  {
    label: 'Edit',
    items: editMenuItems((id) => {
      if (id === 'undo' || id === 'redo') {
        if (active) bridge?.undo(active, id === 'redo');
      } else action(id);
    }),
  },
  {
    label: 'View',
    items: [
      {
        id: 'wrap',
        label: msg('md3eca11714b3'),
        action: () =>
          editor.updateOptions({
            wordWrap: editor.getRawOptions().wordWrap === 'on' ? 'off' : 'on',
          }),
      },
      {
        id: 'theme',
        label: msg('maa77a98a507d'),
        action: () => {
          el<HTMLSelectElement>('themes').value = workspace.theme;
          el<HTMLDialogElement>('theme-picker').showModal();
        },
      },
      languageMenuItem(),
      null,
      ...(['project', 'console', 'problems', 'instructions', 'graph', 'debug'] as const).map(
        (name) => ({
          id: 'show-' + name,
          label: name[0].toUpperCase() + name.slice(1),
          action: () => bridge?.openPanel(group, name),
        }),
      ),
    ],
  },
  {
    label: 'Build',
    items: [
      { id: 'check', label: msg('m8e28a92e2d4d'), action: () => bridge?.check(active) },
      { id: 'menu-run', label: msg('m77721d5dea60'), shortcut: 'Ctrl+Enter', action: run },
      { id: 'download', label: msg('m99847859379a'), action: () => void downloadClass() },
    ],
  },
  { label: 'Debug', items: debugMenuItems(debugActions) },
  { label: 'Help', items: helpMenuItems() },
]);
el<HTMLDialogElement>('open-file').addEventListener('close', () => {
  if (el<HTMLDialogElement>('open-file').returnValue === 'open') {
    const snapshot = bridge?.openTab(group, el<HTMLSelectElement>('workspace-files').value);
    if (snapshot) {
      update(snapshot);
      select(snapshot.id);
    }
  }
});
for (const theme of themes) {
  const option = document.createElement('option');
  option.value = theme.id;
  option.textContent = theme.label;
  el('themes').append(option);
}
el<HTMLSelectElement>('themes').onchange = () =>
  bridge?.theme(el<HTMLSelectElement>('themes').value);
toolTabs = installDetachedTools(bridge, group, () => {
  renderTabs();
  updateActions();
  editor.layout();
});
const instructionClicks = followInstructionClicks(editor, (op) => {
  toolTabs?.showInstruction(op);
  bridge?.instruction(op);
});
const initial = bridge?.attach(group, {
  layout,
  restoreLayout,
  update,
  remove,
  instruction: (op) => toolTabs?.showInstruction(op),
  panel: (name) => toolTabs?.show(name),
  panelRemoved: (name) => toolTabs?.remove(name),
  state: (state) => {
    workspace = state;
    toolTabs?.update(state.tools, state.files, state.graphDocument, state.debug);
    debugEditor.update();
    applyTheme(state.theme, false);
    el('status').textContent = state.status || msg('mb1e61e3ff112');
    updateActions();
  },
  reveal: (selection, id, revealMode) => {
    if (id) select(id);
    if (selection) {
      const p =
        'startLineNumber' in selection
          ? { lineNumber: selection.startLineNumber, column: selection.startColumn }
          : selection;
      revealEditorPosition(editor, p, revealMode);
    }
    editor.focus();
  },
});
for (const snapshot of bridge?.tabs(group) ?? []) update(snapshot);
if (initial) select(initial.id);
else if (!bridge) el('status').textContent = msg('md8e230ba93da');
updateActions();
for (const name of bridge?.panels(group) ?? []) toolTabs?.show(name);
bridge?.ready(group);
const exitDrag = paneWindowExit(bridge?.workspaceId ?? '', (key) => {
  if (!bridge?.detach(group, key)) showHelpMessage(msg('m0b55b1e7085e'), msg('md8421f8771f0'));
});
const dropFiles = paneDrop(document.body, bridge?.workspaceId ?? '', (key, event) => {
  const pane = paneIdentity(key);
  if (!pane) return;
  movePaneOrder(paneOrder, key, beforePane(el('file-tabs'), key, event.clientX));
  if (pane.kind === 'tool') bridge?.openPanel(group, pane.name);
  else {
    const snapshot = bridge?.openTab(group, key);
    if (snapshot) {
      update(snapshot);
      select(snapshot.id);
      editor.focus();
    }
  }
  renderTabs();
});
const searchEverywhere = installSearchEverywhere(
  () => bridge?.searchTargets() ?? Promise.resolve([]),
  async (target) => {
    const result = await bridge?.searchDefinition(target);
    if (!result) throw new Error(msg('m46a9300a9063'));
    return async () => {
      await bridge?.openDefinition(group, result.uri, result.range);
    };
  },
);
const definitionUI = installDefinitionUI(
  (model, offset, labelsOnly) => {
    const tab = [...tabs.values()].find((t) => t.model === model);
    return tab
      ? (bridge?.definitions(tab.state.id, offset, labelsOnly) ?? Promise.resolve([]))
      : Promise.resolve([]);
  },
  (uri, range) => bridge?.openDefinition(group, uri, range) ?? false,
);

const editorCommands = installEditorCommands(editor, run, (redo) => {
  if (active) bridge?.undo(active, redo);
});
const windowCommands = installWindowCommands({ save, open: filePicker.open });
window.addEventListener('pagehide', () => {
  debugEditor.dispose();
  debugKeys.dispose();
  editorCommands.dispose();
  windowCommands.dispose();
  searchEverywhere.dispose();
  filePicker.dispose();
  dropFiles.dispose();
  exitDrag.dispose();
  instructionClicks.dispose();
  toolTabs?.dispose();
  stackHover.dispose();
  definitionUI.dispose();
  bridge?.release(group);
  observer.disconnect();
  overlays.remove();
  sourceAnalysis.dispose();
  editor.dispose();
  for (const tab of tabs.values()) {
    tab.model.dispose();
  }
});

installFeatureGuides();
