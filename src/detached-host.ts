import { msg } from './messages.js';
import type { RevealMode } from './editor-reveal';
import type { DebugCommand, DebugFrame } from './debug-protocol';
import type { AnalysisProgress } from './protocol';
import type { WorkspaceState } from './workspace-state';
export type { ToolState } from './workspace-state';
import type { Compilation, GraphDocument } from './protocol';
import type { FileView } from './project';
import type { WindowLayout } from './workspace-layout';
import type { PanelName } from './panel-dock';
import type { Catalog } from './completion';
import * as monaco from './editor-platform';
import type { DefinitionDocument, SearchTarget } from './navigation';
export interface EditorSnapshot {
  view?: FileView;
  key: string;
  id: string;
  source: string;
  uri: string;
  version: number;
  title: string;
  readOnly: boolean;
  theme: string;
  diagnostics: monaco.editor.IMarkerData[];
}
export type DetachedState = WorkspaceState;
export interface DetachedClient {
  layout?: () => Pick<WindowLayout, 'active' | 'views' | 'wordWrap' | 'order'>;
  restoreLayout?: (layout: WindowLayout) => void;
  instruction?: (op: string) => void;
  panel?: (name: PanelName) => void;
  panelRemoved?: (name: PanelName) => void;
  update: (snapshot: EditorSnapshot) => void;
  remove?: (id: string) => void;
  state?: (state: DetachedState) => void;
  reveal?: (range?: monaco.IRange | monaco.IPosition, id?: string, revealMode?: RevealMode) => void;
}
export interface DetachedDocument {
  key: string;
  title: string;
  model: monaco.editor.ITextModel;
  readOnly: boolean;
}
export interface DetachedBridge {
  debugStart: (id?: string) => void;
  debugCommand: (command: DebugCommand) => void;
  toggleBreakpoint: (uri: string, line: number) => void;
  debugReveal: (frame: DebugFrame) => void;
  graphFocus: (id: string, line: number, column: number) => void;
  ready: (id: string) => void;
  workspaceId: string;
  instruction: (op: string) => void;
  detach: (group: string, key: string) => boolean;
  panels: (group: string) => PanelName[];
  openPanel: (group: string, name: PanelName) => void;
  closePanel: (group: string, name: PanelName) => void;
  problem: (index: number, group: string) => void;
  stdin: (text: string) => void;
  clearOutput: () => void;
  projectAction: (action: 'create' | 'rename' | 'move', path: string, folder: boolean) => void;
  graphCompilation: (
    doc: GraphDocument,
    onProgress?: (progress: AnalysisProgress) => void,
  ) => Promise<Compilation>;
  graphNavigate: (doc: GraphDocument, line: number, column: number) => void;
  compileUsage: (source: string) => Promise<Compilation>;
  compilation: (id: string, version: number) => Promise<Compilation>;
  openFiles: (files: File[], group: string) => Promise<void>;
  searchTargets: () => Promise<SearchTarget[]>;
  searchDefinition: (
    target: SearchTarget,
  ) => Promise<{ uri: string; range: monaco.IRange } | undefined>;
  completionCatalog: () => Promise<Catalog>;
  attach: (id: string, client: DetachedClient) => EditorSnapshot | undefined;
  tabs: (id: string) => EditorSnapshot[];
  openTab: (group: string, key: string) => EditorSnapshot | undefined;
  closeTab: (group: string, id: string) => void;
  edit: (id: string, version: number, source: string) => EditorSnapshot | undefined;
  undo: (id: string, redo: boolean) => void;
  definitions: (id: string, offset: number, labelsOnly?: boolean) => Promise<DefinitionDocument[]>;
  openDefinition: (
    group: string,
    uri: string,
    range?: monaco.IRange | monaco.IPosition,
  ) => Promise<boolean>;
  exportJar: () => void;
  save: () => void;
  run: (id?: string) => void;
  stop: () => void;
  check: (id?: string) => void;
  theme: (id: string) => void;
  classFile: (id: string) => Promise<{ name: string; bytecode: string } | undefined>;
  release: (id: string) => void;
}
declare global {
  interface Window {
    jalwebDetached?: DetachedBridge;
  }
}
// Apply a minimal change so parent selections, decorations and undo history survive.
export function replaceText(model: monaco.editor.ITextModel, text: string) {
  const before = model.getValue();
  if (before === text) return;
  let start = 0,
    end = before.length,
    last = text.length;
  while (start < end && start < last && before[start] === text[start]) start++;
  while (end > start && last > start && before[end - 1] === text[last - 1]) {
    end--;
    last--;
  }
  const a = model.getPositionAt(start),
    b = model.getPositionAt(end);
  model.pushEditOperations(
    null,
    [
      {
        range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column),
        text: text.slice(start, last),
      },
    ],
    () => null,
  );
}
// Monaco 0.52 TextModel exposes undo/redo; its public ITextModel declaration omits them.
type UndoableModel = monaco.editor.ITextModel & {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
};
interface Entry extends DetachedDocument {
  view?: FileView;
  id: string;
  group: string;
  subscriptions: monaco.IDisposable[];
}
interface Group {
  id: string;
  popup: Window;
  client?: DetachedClient;
  initial?: WindowLayout;
  panels: Set<PanelName>;
}
interface Options {
  exportJar: () => void;
  debugStart: (model?: monaco.editor.ITextModel) => void;
  debugCommand: (command: DebugCommand) => void;
  toggleBreakpoint: (uri: string, line: number) => void;
  debugReveal: (frame: DebugFrame) => void;
  graphFocus: (model: monaco.editor.ITextModel, line: number, column: number) => void;
  view?: (key: string) => FileView | undefined;
  instruction?: (op: string) => void;
  panelOpened?: (name: PanelName) => void;
  problem?: (index: number, group: string) => void;
  stdin?: (text: string) => void;
  clearOutput?: () => void;
  projectAction: (action: 'create' | 'rename' | 'move', path: string, folder: boolean) => void;
  graphCompilation: (
    doc: GraphDocument,
    onProgress?: (progress: AnalysisProgress) => void,
  ) => Promise<Compilation>;
  graphNavigate: (doc: GraphDocument, line: number, column: number) => void;
  compileUsage: (source: string) => Promise<Compilation>;
  compile: (model: monaco.editor.ITextModel) => Promise<Compilation>;
  openFiles: (files: File[]) => Promise<string[]>;
  searchTargets: () => Promise<SearchTarget[]>;
  searchDefinition: (
    target: SearchTarget,
  ) => Promise<{ uri: string; range: monaco.IRange } | undefined>;
  completionCatalog: () => Promise<Catalog>;
  subscribe: (listener: () => void) => () => void;
  state: () => DetachedState;
  document: (keyOrUri: string) => DetachedDocument | undefined;
  resolve: (
    model: monaco.editor.ITextModel,
    offset: number,
    labelsOnly?: boolean,
  ) => Promise<DefinitionDocument[]>;
  stop: () => void;
  check: (model?: monaco.editor.ITextModel) => void;
  theme: (id: string) => void;
  classFile: (
    model: monaco.editor.ITextModel,
  ) => Promise<{ name: string; bytecode: string } | undefined>;
}
export function createDetachedHost(
  onReturn: (key: string) => void,
  save: () => void,
  run: (model?: monaco.editor.ITextModel) => void,
  options: Options,
) {
  const entries = new Map<string, Entry>(),
    groups = new Map<string, Group>();
  const snapshot = (e: Entry): EditorSnapshot => ({
    view: e.view,
    key: e.key,
    id: e.id,
    source: e.model.getValue(),
    uri: e.model.uri.toString(),
    version: e.model.getVersionId(),
    title: e.title,
    readOnly: e.readOnly,
    theme: options.state().theme,
    diagnostics: monaco.editor.getModelMarkers({ owner: 'jal', resource: e.model.uri }),
  });
  const broadcast = (e: Entry) => {
    if (!e.model.isDisposed())
      try {
        groups.get(e.group)?.client?.update(snapshot(e));
      } catch {}
  };
  const remove = (id: string) => {
    const e = entries.get(id);
    if (!e) return;
    entries.delete(id);
    for (const d of e.subscriptions) d.dispose();
    groups.get(e.group)?.client?.remove?.(id);
    onReturn(e.key);
    closeIfEmpty(e.group);
  };
  const release = (id: string) => {
    const g = groups.get(id);
    if (!g) return;
    groups.delete(id);
    for (const name of g.panels) onReturn('panel:' + name);
    for (const e of [...entries.values()]) if (e.group === id) remove(e.id);
    try {
      g.popup.close();
    } catch {}
  };
  // Check after the entire tab transfer, not during temporary empty client states.
  function closeIfEmpty(id: string) {
    queueMicrotask(() => {
      const g = groups.get(id);
      if (g && !g.panels.size && ![...entries.values()].some((e) => e.group === id)) release(id);
    });
  }
  const add = (group: string, doc: DetachedDocument, id: string = crypto.randomUUID()) => {
    const e: Entry = { ...doc, view: options.view?.(doc.key), id, group, subscriptions: [] };
    entries.set(id, e);
    doc.model.pushStackElement();
    e.subscriptions.push(
      doc.model.onDidChangeContent(() => broadcast(e)),
      doc.model.onWillDispose(() => remove(id)),
      monaco.editor.onDidChangeMarkers((uris) => {
        if (uris.some((u) => u.toString() === doc.model.uri.toString())) broadcast(e);
      }),
    );
    return e;
  };
  const openTab = (group: string, key: string) => {
    if (!groups.has(group)) return;
    const doc = options.document(key);
    if (!doc || doc.model.isDisposed()) return;
    let e = [...entries.values()].find((e) => e.key === doc.key);
    if (e && e.group !== group) {
      e.view = groups.get(e.group)?.client?.layout?.().views[e.key] ?? e.view;
      const previous = e.group;
      groups.get(previous)?.client?.remove?.(e.id);
      e.group = group;
      closeIfEmpty(previous);
    }
    if (!e) e = add(group, doc);
    broadcast(e);
    onReturn(e.key);
    return snapshot(e);
  };
  const closePanel = (group: string, name: PanelName) => {
    const g = groups.get(group);
    if (g?.panels.delete(name)) {
      g.client?.panelRemoved?.(name);
      onReturn('panel:' + name);
      closeIfEmpty(group);
    }
  };
  const openPanel = (group: string, name: PanelName) => {
    const g = groups.get(group);
    if (!g) return;
    for (const other of groups.values())
      if (other.id !== group && other.panels.delete(name)) {
        other.client?.panelRemoved?.(name);
        closeIfEmpty(other.id);
      }
    g.panels.add(name);
    options.panelOpened?.(name);
    g.client?.panel?.(name);
  };
  window.jalwebDetached = {
    ready(id) {
      const g = groups.get(id);
      if (g?.initial) {
        g.client?.restoreLayout?.(g.initial);
        g.initial = undefined;
      }
    },
    workspaceId: crypto.randomUUID(),
    searchTargets: () => options.searchTargets(),
    searchDefinition: (target) => options.searchDefinition(target),
    instruction: (op) => options.instruction?.(op),
    detach(group, key) {
      const source = groups.get(group);
      if (!source) return false;
      const panel = key.startsWith('panel:') ? (key.slice(6) as PanelName) : undefined;
      if (
        panel
          ? !source.panels.has(panel)
          : ![...entries.values()].some((e) => e.group === group && e.key === key)
      )
        return false;
      const id = crypto.randomUUID(),
        url = new URL('detached.html', new URL(import.meta.env.BASE_URL, location.href));
      url.searchParams.set('editor', id);
      const popup = source.popup.open(url.href, 'jalweb-' + id, 'popup,width=900,height=680');
      if (!popup) return false;
      // Keep the main host as opener even when splitting a detached window.
      popup.opener = window;
      groups.set(id, { id, popup, panels: new Set() });
      if (panel) openPanel(id, panel);
      else openTab(id, key);
      return true;
    },
    panels: (id) => [...(groups.get(id)?.panels ?? [])],
    openPanel,
    closePanel,
    problem: (index, group) => options.problem?.(index, group),
    stdin: (text) => options.stdin?.(text),
    clearOutput: () => options.clearOutput?.(),
    projectAction: (action, path, folder) => options.projectAction(action, path, folder),
    graphCompilation: (doc, onProgress) => options.graphCompilation(doc, onProgress),
    graphNavigate: (doc, line, column) => options.graphNavigate(doc, line, column),
    graphFocus(id, line, column) {
      const e = entries.get(id);
      if (e && !e.model.isDisposed()) options.graphFocus(e.model, line, column);
    },
    compileUsage: (source) => options.compileUsage(source),
    compilation(id, version) {
      const entry = entries.get(id);
      if (!entry || entry.model.isDisposed() || entry.model.getVersionId() !== version)
        return Promise.reject(new Error(msg('ma83c65038a5b')));
      return options.compile(entry.model);
    },
    async openFiles(files, group) {
      if (!groups.has(group)) return;
      for (const key of await options.openFiles(files)) {
        if (!groups.has(group)) break;
        const state = openTab(group, key);
        if (state) groups.get(group)?.client?.reveal?.(undefined, state.id);
      }
    },
    completionCatalog: () => options.completionCatalog(),
    attach(id, client) {
      const g = groups.get(id);
      if (!g) return;
      g.client = client;
      client.state?.(options.state());
      const e = [...entries.values()].find((e) => e.group === id);
      return e ? snapshot(e) : undefined;
    },
    tabs: (id) => [...entries.values()].filter((e) => e.group === id).map(snapshot),
    openTab,
    closeTab(group, id) {
      if (entries.get(id)?.group === group) remove(id);
    },
    edit(id, version, source) {
      const e = entries.get(id);
      if (!e || e.model.isDisposed()) return;
      if (!e.readOnly && version === e.model.getVersionId()) replaceText(e.model, source);
      return snapshot(e);
    },
    undo(id, redo) {
      const e = entries.get(id);
      if (e && !e.readOnly && !e.model.isDisposed()) {
        e.model.pushStackElement();
        const history = e.model as UndoableModel;
        if (redo) void history.redo();
        else void history.undo();
      }
    },
    definitions(id, offset, labelsOnly) {
      const e = entries.get(id);
      return e ? options.resolve(e.model, offset, labelsOnly) : Promise.resolve([]);
    },
    async openDefinition(group, uri, range) {
      const state = openTab(group, uri);
      if (!state) return false;
      groups.get(group)?.client?.reveal?.(range, state.id);
      return true;
    },
    debugStart(id) {
      options.debugStart(id ? entries.get(id)?.model : undefined);
    },
    debugCommand: options.debugCommand,
    toggleBreakpoint: options.toggleBreakpoint,
    debugReveal: options.debugReveal,
    save() {
      if (options.state().canSave) save();
    },
    run(id) {
      run(id ? entries.get(id)?.model : undefined);
    },
    stop: options.stop,
    check(id) {
      options.check(id ? entries.get(id)?.model : undefined);
    },
    theme: options.theme,
    exportJar: () => options.exportJar(),
    classFile: async (id) => {
      const e = entries.get(id);
      return e && !e.readOnly ? options.classFile(e.model) : undefined;
    },
    release,
  };
  let pending: WindowLayout[] = [];
  function restoreWindow(layout: WindowLayout) {
    const docs = layout.tabs
      .map((key) => options.document(key))
      .filter(
        (doc): doc is DetachedDocument =>
          !!doc && !doc.model.isDisposed() && ![...entries.values()].some((e) => e.key === doc.key),
      );
    const panels = layout.panels.filter(
      (name) => ![...groups.values()].some((g) => g.panels.has(name)),
    );
    if (!docs.length && !panels.length) return true;
    const id = crypto.randomUUID(),
      url = new URL('detached.html', new URL(import.meta.env.BASE_URL, location.href));
    url.searchParams.set('editor', id);
    const width = Math.min(layout.width, screen.availWidth),
      height = Math.min(layout.height, screen.availHeight);
    const display = screen as Screen & { availLeft?: number; availTop?: number };
    const left = Math.max(
        display.availLeft ?? 0,
        Math.min(layout.left, (display.availLeft ?? 0) + screen.availWidth - width),
      ),
      top = Math.max(
        display.availTop ?? 0,
        Math.min(layout.top, (display.availTop ?? 0) + screen.availHeight - height),
      );
    const popup = window.open(
      url.href,
      'jalweb-' + id,
      `popup,width=${width},height=${height},left=${left},top=${top}`,
    );
    if (!popup) return false;
    // window.open dimensions describe the content area; persist the outer frame without growth on every reopen.
    try {
      popup.resizeTo(width, height);
      popup.moveTo(left, top);
    } catch {}
    groups.set(id, { id, popup, panels: new Set(), initial: layout });
    for (const doc of docs) {
      add(id, doc);
      onReturn(doc.key);
    }
    for (const name of panels) openPanel(id, name);
    return true;
  }
  // Browsers may require a fresh user gesture for each popup. Keep the saved layout
  // until that gesture; its files remain accessible in the main window meanwhile.
  const resume = (event: Event) => {
    if (!event.isTrusted || !pending.length) return;
    const next = pending[0];
    if (restoreWindow(next)) pending.shift();
  };
  window.addEventListener('click', resume);
  window.addEventListener('keydown', resume);
  const refresh = () => {
    const state = options.state();
    for (const g of groups.values())
      try {
        g.client?.state?.(state);
      } catch {}
  };
  const unsubscribe = options.subscribe(refresh);
  // Closing a native window is an external event; retain a fallback for lost unload events.
  const watcher = setInterval(() => {
    for (const g of groups.values()) if (g.popup.closed) release(g.id);
  }, 300);
  return {
    snapshot(): WindowLayout[] {
      return [...groups.values()]
        .filter((g) => !g.popup.closed)
        .map((g) => {
          const tabs = [...entries.values()].filter((e) => e.group === g.id).map((e) => e.key);
          let state = g.initial
            ? {
                active: g.initial.active,
                views: g.initial.views,
                wordWrap: g.initial.wordWrap,
                order: g.initial.order,
              }
            : {
                active: tabs[0] ?? 'panel:' + ([...g.panels][0] ?? ''),
                views: {},
                wordWrap: false,
              };
          try {
            state = g.client?.layout?.() ?? state;
          } catch {}
          return {
            tabs,
            panels: [...g.panels],
            ...state,
            left: g.popup.screenX,
            top: g.popup.screenY,
            width: g.popup.outerWidth,
            height: g.popup.outerHeight,
          };
        })
        .concat(pending);
    },
    restore(layouts: WindowLayout[]) {
      pending = [];
      for (const layout of layouts) if (!restoreWindow(layout)) pending.push(layout);
    },
    showInstruction(op: string) {
      const g = [...groups.values()].find((g) => g.panels.has('instructions'));
      if (g) g.client?.instruction?.(op);
    },
    hasPanel: (name: PanelName) => [...groups.values()].some((g) => g.panels.has(name)),
    focusPanel(name: PanelName) {
      const g = [...groups.values()].find((g) => g.panels.has(name));
      if (g) {
        g.client?.panel?.(name);
        g.popup.focus();
      }
    },
    openPanel(name: PanelName) {
      if (this.hasPanel(name)) {
        this.focusPanel(name);
        return true;
      }
      const id = crypto.randomUUID(),
        url = new URL('detached.html', new URL(import.meta.env.BASE_URL, location.href));
      url.searchParams.set('editor', id);
      const popup = window.open(url.href, 'jalweb-' + id, 'popup,width=900,height=680');
      if (!popup) return false;
      groups.set(id, { id, popup, panels: new Set() });
      openPanel(id, name);
      return true;
    },
    returnPanel(name: PanelName) {
      for (const g of groups.values()) if (g.panels.has(name)) closePanel(g.id, name);
    },
    returnTab(key: string) {
      const e = [...entries.values()].find((e) => e.key === key);
      if (!e) return;
      const view = groups.get(e.group)?.client?.layout?.().views[e.key] ?? e.view;
      remove(e.id);
      return view;
    },
    replaceDocument(key: string, doc: DetachedDocument) {
      const entry = [...entries.values()].find((e) => e.key === key);
      if (!entry) return;
      const view = groups.get(entry.group)?.client?.layout?.().views[key];
      for (const subscription of entry.subscriptions) subscription.dispose();
      entries.delete(entry.id);
      const next = add(entry.group, doc, entry.id);
      next.view = view;
      broadcast(next);
    },
    has: (key: string) => [...entries.values()].some((e) => e.key === key),
    focus(key: string) {
      const e = [...entries.values()].find((e) => e.key === key);
      if (e) {
        groups.get(e.group)?.client?.reveal?.(undefined, e.id);
        groups.get(e.group)?.popup.focus();
      }
    },
    reveal(
      key: string,
      range?: monaco.IRange | monaco.IPosition,
      revealMode: RevealMode = 'center',
    ) {
      const e = [...entries.values()].find((e) => e.key === key);
      if (e) {
        groups.get(e.group)?.client?.reveal?.(range, e.id, revealMode);
        groups.get(e.group)?.popup.focus();
      }
    },
    open(key: string, title: string, model: monaco.editor.ITextModel, readOnly: boolean) {
      if (this.has(key)) {
        this.focus(key);
        return true;
      }
      const id = crypto.randomUUID(),
        url = new URL('detached.html', new URL(import.meta.env.BASE_URL, location.href));
      url.searchParams.set('editor', id);
      const popup = window.open(url.href, 'jalweb-' + id, 'popup,width=900,height=680');
      if (!popup) return false;
      groups.set(id, { id, popup, panels: new Set() });
      add(id, { key, title, model, readOnly }, id);
      return true;
    },
    closeAll() {
      pending = [];
      for (const id of [...groups.keys()]) release(id);
    },
    dispose() {
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
      clearInterval(watcher);
      unsubscribe();
      this.closeAll();
      delete window.jalwebDetached;
    },
  };
}
