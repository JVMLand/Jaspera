import { codeFontFamily } from './fonts';
import { entryProblem } from './entry-method.js';
import { SourceDocuments } from './source-documents';
import { languageMenuItem } from './localization';
import { msg } from './messages.js';
import { revealEditorPosition, type RevealMode } from './editor-reveal';
import { installFeatureGuides } from './feature-guides';
import { BreakpointStore } from './breakpoint-store';
import { installDebugPanel, debugMenuItems, installDebugKeys } from './debug-panel';
import { installDebugEditor } from './debug-editor';
import type { DebugState, DebugCommand, DebugFrame } from './debug-protocol';
import { APP_NAME, APP_TAGLINE, APP_TITLE } from './brand';
import { sourceMerge } from './source-merge';
import { installEditorCommands, installWindowCommands } from './editor-commands';
import { installSearchEverywhere } from './search-everywhere';
import type { AnalysisProgress } from './protocol';
import { memoryPolicy } from './memory-policy';
import { usageCompiler } from './usage-compilation';
import { installInstructionGraph } from './lazy-instruction-graph';
import type { GraphDocument } from './protocol';
import { planPathChange } from './project-paths';
import { tabLabels } from './file-labels';
import {
  examples,
  exampleSource,
  rememberExample,
  withoutExampleLayout,
  isEditedExample,
  translatedExample,
} from './example-library';
import { inlayHintOptions } from './inlay-hint-style';
import { installConsoleContextMenu } from './console-panel';
import { installProblemsContextMenu } from './problems-panel';
import { editMenuItems } from './edit-menu';
import { fileKind, installFilePicker } from './file-opening';
import type { JarArchive } from './jar-archive';
import { helpMenuItems } from './help';
import * as monaco from './editor-platform';
import { WorkspaceStateStore } from './workspace-state';
import { CompilationService } from './compilation-service';
import { SourceAnalysis, showBytecodeOffsets } from './source-analysis';
import { EditorPane, paneTab, paneIdentity, beforePane, movePaneOrder } from './pane';
import { layoutSides, type WorkspaceLayout } from './workspace-layout';
import { renderProjectTree } from './project-tree';
import { paneDrop, paneWindowExit } from './tab-interactions';
import type { Side } from './panel-dock';
import { followInstructionClicks } from './instruction-click';
import { installPanelDock } from './panel-dock';
import { installInstructionsPanel } from './lazy-instructions-panel';
import { installStackHover } from './stack-hover';
import { currentInspections } from './inspection-actions';

import { registerLanguage } from './language';
import { Runtime } from './runtime';
import { createDetachedHost } from './detached-host';
import { createNavigation, installDefinitionUI } from './navigation';
import {
  defaultProject,
  validateProject,
  validatePath as relativePath,
  type Project,
} from './project';
import {
  openFolder,
  parseProperties,
  pickFolder,
  newBinding,
  saveFolder,
  projectArchive,
  type FolderBinding,
  type ClassFileEntry,
} from './folder-project';
import { installMenus } from './menus';
import type { Compilation } from './protocol';
import './style.css';
import './theme-layouts.css';
import {
  initializeThemes,
  openThemePicker,
  applyTheme,
  onThemeChange,
  selectedTheme,
} from './themes';

registerLanguage(() => navigation.completionCatalog());
document.querySelector<HTMLDivElement>('#app')!.innerHTML = msg('m6d5204937715', [
  APP_NAME,
  APP_TAGLINE,
]);
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let project = defaultProject(false);
const workspaceState = new WorkspaceStateStore();
workspaceState.update({ debug: { status: 'idle', breakpoints: [] } });
const debugSources = new Map<string, string>();
const debugEditors: ReturnType<typeof installDebugEditor>[] = [];
const debugActions = {
  start: () => {
    if (!running) void run(undefined, true);
  },
  command: debugCommand,
  stop: () => stopRun(),
  reveal: (frame: DebugFrame) => {
    void revealDebugFrame(frame);
  },
};
function debugState(patch: Partial<DebugState>) {
  workspaceState.update({ debug: { ...workspaceState.value.debug!, ...patch } });
}
const breakpoints = new BreakpointStore((points) => {
  debugState({ breakpoints: points });
  if (runner && ['paused', 'running'].includes(workspaceState.value.debug!.status))
    void runner.debugBreakpoints(runtimeBreakpoints()).catch(() => {});
});
function toggleBreakpoint(uri: string, line: number) {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri));
  if (model) breakpoints.toggle(model, line);
}

function runtimeBreakpoints() {
  return workspaceState.value.debug!.breakpoints.flatMap((b) => {
    const owner = [...debugSources].find(([, uri]) => uri === b.uri)?.[0];
    return owner ? [{ className: owner, line: b.line }] : [];
  });
}
function debugCommand(command: DebugCommand) {
  const state = workspaceState.value.debug,
    owned = runner,
    token = runToken;
  if (
    !owned ||
    !state ||
    (command === 'pause' ? state.status !== 'running' : state.status !== 'paused')
  )
    return;
  if (command !== 'pause') debugState({ status: 'running' });
  void owned.debugCommand(command).catch((e) => {
    if (runner !== owned || token !== runToken) return;
    stopRun(false);
    status(e.message, 'error');
  });
}
async function revealDebugFrame(frame: DebugFrame) {
  const snapshot = workspaceState.value.debug?.snapshot;
  if (!snapshot) return;
  const current = () =>
    workspaceState.value.debug?.status === 'paused' &&
    workspaceState.value.debug.snapshot === snapshot;
  const uri = debugSources.get(frame.className);
  if (uri && frame.line > 0) {
    if (current()) await openDefinition(uri, { lineNumber: frame.line, column: 1 }, 'ifOutside');
    return;
  }
  try {
    const location = frame.native
      ? undefined
      : await navigation.instructionLocation(
          frame.className,
          frame.method,
          frame.descriptor,
          frame.pc,
        );
    if (!current()) return;
    if (location) {
      if (frame === snapshot.frames[0]) debugState({ instructionLocation: location });
      await openDefinition(location.uri, { lineNumber: location.line, column: 1 }, 'ifOutside');
      return;
    }
    const target = await navigation.searchDefinition({
      kind: 'method',
      label: frame.method,
      detail: frame.className,
      owner: frame.className,
      name: frame.method,
      descriptor: frame.descriptor,
    });
    if (target && current()) await openDefinition(target.uri, target.range, 'ifOutside');
  } catch (error) {
    if (current()) status(error instanceof Error ? error.message : String(error), 'error');
  }
}

const unsubscribeTheme = onThemeChange((theme) => workspaceState.update({ theme }));
interface ClassPreview {
  jarEntry?: string;
  editable?: boolean;
  example?: boolean;
  key: string;
  title: string;
  model: monaco.editor.ITextModel;
  folderPath?: string;
  mtime: number;
  size: number;
}
const classPreviews = new Map<string, ClassPreview>();
let jar: JarArchive | undefined;
let jarBusy = false;
let activePreview: string | undefined,
  previewEpoch = 0,
  dropSequence = 0;
window.addEventListener('jaspera:locale', () => {
  if (workspaceState.value.running) return;
  for (const preview of classPreviews.values())
    if (preview.example && !isEditedExample(preview.title)) {
      const source = translatedExample(preview.title);
      if (source !== undefined && source !== preview.model.getValue())
        breakpoints.replaceTranslatedSource(preview.model, source);
    }
});
let classQueue = Promise.resolve();
let folder: FolderBinding | undefined,
  storageBusy = false,
  changeVersion = 0,
  watchBusy = false,
  applyingExternal = false;
let dirty = false,
  revision = 0,
  checkedRevision = -1,
  running = false,
  runToken = 0,
  disposed = false;
let models = new Map<string, monaco.editor.ITextModel>();
const closedSourceTabs = new Set<string>();
let tabOrder: string[] = [];
let restoringLayout = false;
let results = new Map<string, Compilation>();
let problemTargets: { path: string; line: number; column: number }[] = [];
const sourceAnalysis = new SourceAnalysis(
  (model) => {
    if ([...models.values()].includes(model)) showDiagnostics();
    updateActions();
    for (const view of groupEditors.values()) if (view.getModel() === model) refreshOffsets(view);
  },
  (model) => [...models.values()].includes(model) || model.uri.authority === 'example',
);
const scheduleOffsets = (model: monaco.editor.ITextModel) => sourceAnalysis.schedule(model);
let analysisPromise: Promise<void> | undefined;
let analysisTimer: ReturnType<typeof setTimeout>;
const memory = memoryPolicy((navigator as Navigator & { deviceMemory?: number }).deviceMemory);
const compiler = new Runtime(memory.analysisHeapMiB);
const compilationService = new CompilationService(compiler, memory.backgroundIdleMs);
const visibilityChanged = () =>
  compilationService.setBackground(document.visibilityState === 'hidden');
document.addEventListener('visibilitychange', visibilityChanged);
visibilityChanged();
const compileUsage = usageCompiler(compilationService, memory.usageCacheEntries);
const compileModel = (model: monaco.editor.ITextModel) =>
  compilationService.compile(model, model.getValue(), undefined, { stackFrames: true });
function graphFocus(model: monaco.editor.ITextModel, line = 1, column = 1) {
  const previous = workspaceState.value.graphDocument,
    uri = model.uri.toString(),
    version = model.getVersionId();
  const same = previous?.uri === uri && previous.version === version;
  if (same && previous.line === line && previous.column === column) return;
  workspaceState.update({
    graphDocument: {
      uri,
      version,
      line,
      column,
      source: same ? previous.source : model.getValue(),
    },
  });
}
function graphModel(doc: GraphDocument) {
  const model = monaco.editor.getModel(monaco.Uri.parse(doc.uri));
  return model &&
    !model.isDisposed() &&
    model.getVersionId() === doc.version &&
    model.getValue() === doc.source
    ? model
    : undefined;
}
const graphCompilation = (
  doc: GraphDocument,
  onProgress?: (progress: AnalysisProgress) => void,
) => {
  const model = graphModel(doc);
  return model
    ? compilationService.compile(model, model.getValue(), onProgress, { graphs: true })
    : Promise.reject(new Error(msg('ma83c65038a5b')));
};
const graphNavigate = (doc: GraphDocument, line: number, column: number) => {
  if (graphModel(doc)) void openDefinition(doc.uri, { lineNumber: line, column });
};
let runner: Runtime | undefined;
const editorOverlays = document.createElement('div');
editorOverlays.id = 'editor-overlays';
document.body.append(editorOverlays);
// Theme is global to Monaco; editor options must not override it when groups are created.
initializeThemes();
workspaceState.update({ theme: selectedTheme() });
export let editor = monaco.editor.create(el('editor'), {
  inlayHints: inlayHintOptions,
  overflowWidgetsDomNode: editorOverlays,
  fixedOverflowWidgets: true,
  automaticLayout: true,
  fontSize: 15,
  lineHeight: 27,
  fontFamily: codeFontFamily,
  fontLigatures: true,
  minimap: { enabled: false },
  padding: { top: 24, bottom: 24 },
  scrollBeyondLastLine: false,
  tabSize: 2,
  insertSpaces: true,
  renderLineHighlight: 'line',
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  lineNumbersMinChars: 10,
  folding: true,
  glyphMargin: false,
  wordWrap: 'off',
  ariaLabel: msg('mb6b9cb49c13c'),
  quickSuggestions: { other: true, comments: false, strings: false },
});
const groupEditors = new Map<Side, monaco.editor.IStandaloneCodeEditor>([['source', editor]]);
const sourceGroups = new Map<string, Side>();
let activeSide: Side = 'source';
el('editor').classList.add('group-editor');
const groupResources: monaco.IDisposable[] = [];
const syncOverlayTheme = () => {
  editorOverlays.className = editor.getDomNode()!.className;
};
const overlayThemeObserver = new MutationObserver(syncOverlayTheme);
overlayThemeObserver.observe(editor.getDomNode()!, {
  attributes: true,
  attributeFilter: ['class'],
});
syncOverlayTheme();
const stackHover = installStackHover(editor, compileModel);
const detached = createDetachedHost(
  (key) => {
    const owner = project;
    queueMicrotask(() => {
      if (disposed || restoringLayout || project !== owner) return;
      for (const view of groupEditors.values()) {
        const model = view.getModel(),
          doc = model ? detachableDocument(model.uri.toString()) : undefined;
        if (doc && detached.has(doc.key)) view.setModel(null);
      }
      if (key.startsWith('panel:')) {
        panelDock?.show(
          key.slice(6) as 'project' | 'console' | 'problems' | 'instructions' | 'graph' | 'debug',
        );
        return;
      }
      const current = editor.getModel();
      if (
        current &&
        detached.has(
          !activePreview ? 'source:' + project.workspace.activeFile : 'preview:' + activePreview,
        )
      ) {
        captureView();
        activePreview = undefined;
        editor.setModel(null);
      }
      const tab = visibleTabs().find((t) => t.key === key);
      const next = tab ?? visibleTabs()[0];
      if (!editor.getModel() && next) selectEditorTab(next);
      else {
        renderFiles();
        updateActions();
      }
    });
  },
  () => void saveProject(),
  (model) => void run(model),
  {
    debugStart: (model) => {
      if (!running) void run(model, true);
    },
    debugCommand,
    toggleBreakpoint,
    debugReveal: (frame) => void revealDebugFrame(frame),
    searchTargets: () => navigation.searchTargets(),
    searchDefinition: (target) => navigation.searchDefinition(target),
    graphFocus,
    graphCompilation,
    graphNavigate,
    projectAction,
    compileUsage,
    compile: compileModel,
    resolve: (model, offset, labelsOnly) => navigation.resolve(model, offset, labelsOnly),
    completionCatalog: () => navigation.completionCatalog(),
    document: detachableDocument,
    view: (key) => {
      const doc = detachableDocument(key),
        view = [...groupEditors.values()].find((v) => v.getModel() === doc?.model),
        p = view?.getPosition();
      return p && view
        ? {
            line: p.lineNumber,
            column: p.column,
            scrollTop: Math.round(view.getScrollTop()),
            scrollLeft: Math.round(view.getScrollLeft()),
          }
        : key.startsWith('source:')
          ? project.workspace.views[key.slice(7)]
          : undefined;
    },
    openFiles,
    exportJar: () => void downloadJar(),
    state: () => workspaceState.value,
    subscribe: (listener) => workspaceState.subscribe(listener),
    instruction: (op) => {
      instructionPanel.showInstruction(op);
      detached.showInstruction(op);
    },
    panelOpened: (name) => panelDock?.close(name),
    stdin: setStdin,
    clearOutput: () => el('clear').click(),
    problem: (index, group) => {
      const target = problemTargets[index],
        model = target ? models.get(target.path) : undefined;
      if (target && model)
        void window.jalwebDetached?.openDefinition(
          group,
          model.uri.toString(),
          model.validatePosition({ lineNumber: target.line, column: target.column }),
        );
    },
    stop: () => stopRun(),
    check: (model) => void checkDocument(model),
    theme: (id) => applyTheme(id),
    async classFile(model) {
      if (model.uri.authority === 'example') {
        const c = await compileExample(model);
        return c.bytecode
          ? { name: c.className.split('/').pop() + '.class', bytecode: c.bytecode }
          : undefined;
      }
      await analyze();
      const path = [...models].find(([, m]) => m === model)?.[0],
        c = path ? results.get(path) : undefined;
      if (checkedRevision === revision && c?.bytecode)
        return { name: c.className.split('/').pop() + '.class', bytecode: c.bytecode };
    },
  },
);

const navigation = createNavigation({
  models: () => [...models.values(), ...[...classPreviews.values()].map((p) => p.model)],
  async classBytes(owner) {
    const matches = (folder?.classFiles ?? []).filter(
      (f) => f.path === owner + '.class' || f.path.endsWith('/' + owner + '.class'),
    );
    if (matches.length !== 1) return;
    const file = await matches[0].handle.getFile();
    if (file.size > 1024 * 1024) return;
    return new Uint8Array(await file.arrayBuffer());
  },
  async disassemble(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const work = classQueue.then(() => compilationService.disassemble(btoa(binary)));
    classQueue = work.then(
      () => {},
      () => {},
    );
    return work;
  },
});
const searchEverywhere = installSearchEverywhere(
  () => navigation.searchTargets(),
  async (target) => {
    const result = await navigation.searchDefinition(target);
    if (!result) throw new Error(msg('m46a9300a9063'));
    return async () => {
      await openDefinition(result.uri, result.range);
    };
  },
);
el('header-search').onclick = () => {
  void searchEverywhere.show();
};
const definitionUI = installDefinitionUI(
  (model, offset, labelsOnly) => navigation.resolve(model, offset, labelsOnly),
  openDefinition,
);
function previewTitle(p: ClassPreview) {
  return p.example || p.jarEntry ? p.title : p.title + ' (JAL)';
}
function ensureExample(path: string) {
  const key = 'example:' + path;
  if (classPreviews.has(key)) return classPreviews.get(key);
  const source = exampleSource(path);
  if (source === undefined) return;
  const model = monaco.editor.createModel(
    source,
    'jal',
    monaco.Uri.from({ scheme: 'inmemory', authority: 'example', path: '/' + path }),
  );
  const preview: ClassPreview = { key, title: path, model, example: true, mtime: 0, size: 0 };
  classPreviews.set(key, preview);
  if (path === 'example/HelloWorld.jal') {
    const line = source.split(/\r?\n/).findIndex((text) => /^\s*invokevirtual\b/.test(text));
    if (line >= 0) breakpoints.toggle(model, line + 1);
  }
  model.onDidChangeContent(() => {
    rememberExample(path, model.getValue());
    scheduleOffsets(model);
    updateActions();
    monaco.editor.setModelMarkers(model, 'jal', []);
  });
  scheduleOffsets(model);
  return preview;
}
async function checkDocument(model: monaco.editor.ITextModel | null = editor.getModel()) {
  if (model?.uri.authority !== 'example') {
    clearTimeout(analysisTimer);
    await analyze();
    return;
  }
  try {
    const result = await compileExample(model);
    status(
      result.diagnostics.some((d) => d.severity === 'error')
        ? msg('m428b24c11fc6')
        : msg('mc2c1724a78a8'),
      result.diagnostics.some((d) => d.severity === 'error') ? 'error' : 'ready',
    );
  } catch (error) {
    status(String(error), 'error');
  }
}
async function compileExample(model: monaco.editor.ITextModel) {
  const version = model.getVersionId(),
    result = await compilationService.compile(model, model.getValue(), undefined, {});
  if (!model.isDisposed() && model.getVersionId() === version)
    monaco.editor.setModelMarkers(
      model,
      'jal',
      result.diagnostics.map((d) => {
        const p = model.validatePosition({ lineNumber: d.line, column: d.column });
        return {
          severity:
            d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: d.message,
          startLineNumber: p.lineNumber,
          startColumn: p.column,
          endLineNumber: p.lineNumber,
          endColumn: Math.min(
            model.getLineMaxColumn(p.lineNumber),
            p.column + Math.max(1, d.length),
          ),
          source: 'JAL',
        };
      }),
    );
  return result;
}
function detachableDocument(keyOrUri: string) {
  if (keyOrUri.startsWith('preview:example:'))
    ensureExample(keyOrUri.slice('preview:example:'.length));
  const source = [...models].find(
    ([path, m]) => 'source:' + path === keyOrUri || m.uri.toString() === keyOrUri,
  );
  if (source)
    return { key: 'source:' + source[0], title: source[0], model: source[1], readOnly: false };
  let preview = [...classPreviews.values()].find(
    (p) => 'preview:' + p.key === keyOrUri || p.model.uri.toString() === keyOrUri,
  );
  if (!preview) {
    const model = monaco.editor
      .getModels()
      .find((m) => m.uri.toString() === keyOrUri && m.uri.authority === 'definition');
    if (!model || model.isDisposed()) return;
    const name = model.uri.path.slice(1).replace(/\.jal$/, '.class');
    preview = { key: 'definition:' + name, title: name, model, mtime: 0, size: 0 };
    classPreviews.set(preview.key, preview);
    scheduleOffsets(model);
  }
  return {
    key: 'preview:' + preview.key,
    title: previewTitle(preview),
    model: preview.model,
    readOnly: !preview.example && !preview.editable,
  };
}
async function openDefinition(
  uri: string,
  selection?: monaco.IRange | monaco.IPosition,
  revealMode: RevealMode = 'center',
) {
  const model = monaco.editor.getModel(monaco.Uri.parse(uri));
  if (!model || model.isDisposed()) return false;
  const source = [...models].find(([, m]) => m === model);
  let key: string;
  if (source) {
    key = 'source:' + source[0];
    if (!detached.has(key)) switchFile(source[0]);
  } else {
    let preview = [...classPreviews.values()].find((p) => p.model === model);
    if (!preview) {
      if (model.uri.authority !== 'definition') return false;
      const name = model.uri.path.slice(1).replace(/\.jal$/, '.class');
      preview = { key: 'definition:' + name, title: name, model, mtime: 0, size: 0 };
      classPreviews.set(preview.key, preview);
      scheduleOffsets(model);
    }
    key = 'preview:' + preview.key;
    if (!detached.has(key)) selectClassPreview(preview.key);
  }
  if (detached.has(key)) {
    detached.reveal(key, selection, revealMode);
    return true;
  }
  if (selection) {
    const position =
      'startLineNumber' in selection
        ? { lineNumber: selection.startLineNumber, column: selection.startColumn }
        : selection;
    revealEditorPosition(editor, position, revealMode);
  }
  editor.focus();
  window.focus();
  return true;
}
let panelDock: ReturnType<typeof installPanelDock> | undefined;
const filePicker = installFilePicker((files) => void openFiles(files));
const menus = installMenus(el('menus'), [
  {
    label: 'File',
    items: [
      { id: 'new-file', label: msg('m79e3104df1cf'), action: () => void addFile() },
      { id: 'new-project', label: msg('ma582ee597220'), action: () => void newProject() },
      null,
      {
        id: 'open-files',
        label: msg('mba31551c9cbe'),
        shortcut: 'Ctrl+O',
        action: filePicker.open,
      },
      { id: 'open-project', label: msg('m3e527b2cb344'), action: () => void openProjectFolder() },
      null,
      {
        id: 'save-project',
        label: msg('ma3030bf8f16d'),
        shortcut: 'Ctrl+S',
        action: () => void saveProject(),
      },
      { id: 'save-project-as', label: msg('m97b4e8936a4b'), action: () => void saveProject(true) },
      { id: 'export-project', label: msg('m36581f447816'), action: () => void exportProject() },
      { id: 'download-jar', label: msg('jar.download'), action: () => void downloadJar() },
      { id: 'close-jar', label: msg('jar.close'), action: () => void closeJar() },
      {
        id: 'save-class-source',
        label: msg('m55345dd68b3a'),
        action: () => {
          const p = activePreview ? classPreviews.get(activePreview) : undefined;
          if (p)
            download(
              new Blob([p.model.getValue()], { type: 'text/plain;charset=utf-8' }),
              p.title
                .replace(/\.class$/i, '.jal')
                .split('/')
                .pop()!,
            );
        },
      },
      null,
      {
        id: 'close-tab',
        label: msg('m7e4105690e2c'),
        action: () => {
          const tab = visibleTabs().find((t) => t.active);
          if (tab) closeEditorTabs(tab.key);
        },
      },
      { id: 'rename-file', label: msg('m845f8265321f'), action: () => void renameFile() },
      { id: 'remove-file', label: msg('ma270f3c87416'), action: () => void removeFile() },
      null,
      { id: 'project-properties-menu', label: msg('mba06c39028c1'), action: openProperties },
    ],
  },
  { label: 'Edit', items: editMenuItems(editAction) },
  {
    label: 'View',
    items: [
      {
        id: 'wrap',
        label: msg('md3eca11714b3'),
        action: () => {
          project.workspace.wordWrap = !project.workspace.wordWrap;
          editor.updateOptions({ wordWrap: project.workspace.wordWrap ? 'on' : 'off' });
          setDirty();
        },
      },
      { id: 'theme-settings', label: msg('maa77a98a507d'), action: openThemePicker },
      languageMenuItem(),
      null,
      ...(['project', 'console', 'problems', 'instructions', 'graph', 'debug'] as const).map(
        (name) => ({
          id: 'show-' + name,
          label: name[0].toUpperCase() + name.slice(1),
          action: () => selectTab(name),
        }),
      ),
      { id: 'swap-panes', label: msg('mcd86386ee2e5'), action: () => panelDock?.swap() },
    ],
  },
  {
    label: 'Build',
    items: [
      { id: 'check-project', label: msg('m8e28a92e2d4d'), action: () => void checkDocument() },
      {
        id: 'menu-run',
        label: msg('m77721d5dea60'),
        shortcut: 'Ctrl+Enter',
        action: () => void run(),
      },
      { id: 'download', label: msg('m99847859379a'), action: downloadClass },
    ],
  },
  { label: 'Debug', items: debugMenuItems(debugActions) },
  { label: 'Help', items: helpMenuItems() },
]);
function status(text: string, kind: 'ready' | 'loading' | 'error' = 'ready') {
  if (text === msg('mc2c1724a78a8') && !running) text = runUnavailable() || text;
  workspaceState.update({ status: text });
  el('state').textContent = text;
  el('state-dot').className = `status-dot ${kind}`;
}
function setDirty(value = true) {
  if (value) changeVersion++;
  dirty = value;
  el('project-name').textContent = project.name + (dirty ? ' •' : '');
  document.title = `${dirty ? '• ' : ''}${project.name} — ${APP_TITLE}`;
  el('summary-project-name').textContent = project.name;
}
function validatePath(path: string) {
  relativePath(path);
  if (folder?.properties !== false && !path.startsWith('src/'))
    throw new Error(msg('m35c9589b91c3'));
}
function refreshOffsets(view = editor) {
  showBytecodeOffsets(view, sourceAnalysis.offsets(view.getModel()));
}
function runUnavailable(model = editor.getModel()): string {
  const target =
    model?.uri.authority === 'example' ? model : (models.get(project.workspace.entryFile) ?? null);
  if (!target) return msg('run.noMain');
  const entry = sourceAnalysis.entry(target);
  if (!entry) return msg('run.checkingMain');
  const problem = entryProblem(
    entry,
    [...models.values()].flatMap((m) => sourceAnalysis.entry(m) ?? []),
  );
  return problem ? msg(problem) : '';
}
function publishWorkspaceAvailability() {
  workspaceState.update({
    canSave: !!folder && !storageBusy,
    canExportJar: !!jar && !jarBusy,
    running,
    runAvailability: {
      '': runUnavailable(),
      project: runUnavailable(null),
      ...Object.fromEntries(
        [...classPreviews.values()]
          .filter((p) => p.example)
          .map((p) => [p.model.uri.toString(), runUnavailable(p.model)]),
      ),
    },
  });
}
function updateActions() {
  menus.disabled('download-jar', !jar || jarBusy);
  menus.disabled('close-jar', !jar || jarBusy);
  publishWorkspaceAvailability();
  refreshOffsets();
  const model = editor.getModel(),
    readOnly = editor.getRawOptions().readOnly;
  for (const id of ['undo', 'redo', 'replace', 'format', 'comment', 'quick-fix'])
    menus.disabled(id, !model || !!readOnly);
  menus.disabled('find', !model);
  menus.disabled('rename-file', !!activePreview || !editor.getModel() || !project.files.length);
  menus.disabled('close-tab', !editor.getModel());
  menus.hidden('save-class-source', !activePreview);
  menus.disabled('project-properties-menu', folder?.properties === false);
  el<HTMLButtonElement>('summary-properties').disabled = folder?.properties === false;
  const runButton = el<HTMLButtonElement>('run');
  runButton.innerHTML = running
    ? '<span aria-hidden="true">■</span> Stop <kbd>Ctrl ↵</kbd>'
    : '<span aria-hidden="true">▶</span> Run <kbd>Ctrl ↵</kbd>';
  const unavailable = running ? '' : runUnavailable();
  runButton.disabled = !!unavailable;
  menus.disabled('menu-run', !!unavailable);
  menus.disabled('debug-start', running || !!unavailable);
  runButton.title =
    unavailable || (running ? msg('mca4d973c0b00') : msg('m77721d5dea60')) + '（Ctrl+Enter / F5）';
  if (
    !running &&
    [
      msg('mc2c1724a78a8'),
      ...['run.noMain', 'run.noConstructor', 'run.abstractMain', 'run.checkingMain'].map((key) =>
        msg(key),
      ),
    ].includes(workspaceState.value.status)
  )
    status(unavailable || msg('mc2c1724a78a8'));
  runButton.setAttribute('aria-label', running ? msg('mca4d973c0b00') : msg('m77721d5dea60'));
  menus.label('menu-run', running ? msg('mca4d973c0b00') : msg('m77721d5dea60'));
  menus.disabled(
    'download',
    editor.getModel()?.uri.authority !== 'example' &&
      (!!activePreview ||
        !editor.getModel() ||
        checkedRevision !== revision ||
        !results.get(project.workspace.activeFile)?.bytecode),
  );
  menus.disabled('remove-file', !!activePreview || !editor.getModel() || project.files.length <= 1);
}
function editAction(id: string) {
  editor.focus();
  editor.trigger('menu', id, undefined);
}
function captureView() {
  if (activePreview) return;
  const p = editor.getPosition();
  if (!p) return;
  project.workspace.views[project.workspace.activeFile] = {
    line: p.lineNumber,
    column: p.column,
    scrollTop: Math.round(editor.getScrollTop()),
    scrollLeft: Math.round(editor.getScrollLeft()),
  };
}
function switchFile(path: string, saveView = true) {
  if (saveView) captureView();
  activeSide = sourceGroups.get('source:' + path) ?? 'source';
  editor = groupEditors.get(activeSide)!;
  panelDock?.showSource(activeSide);
  if (detached.has('source:' + path)) {
    detached.focus('source:' + path);
    return;
  }

  closedSourceTabs.delete(path);
  activePreview = undefined;
  editor.updateOptions({ readOnly: false });
  project.workspace.activeFile = path;
  editor.setModel(models.get(path) ?? null);
  if (!editor.getModel()) {
    renderFiles();
    updateActions();
    return;
  }
  const v = project.workspace.views[path];
  editor.setPosition(
    editor.getModel()!.validatePosition({ lineNumber: v?.line ?? 1, column: v?.column ?? 1 }),
  );
  editor.setScrollPosition({ scrollTop: v?.scrollTop ?? 0, scrollLeft: v?.scrollLeft ?? 0 });
  renderFiles();
  updateActions();
}
const collapsedFolders = new Set<string>();
function renderFiles() {
  workspaceState.update({
    files: [
      ...project.files.map((f) => ({ key: 'source:' + f.path, title: f.path })),
      ...examples.map((f) => ({ key: 'preview:example:' + f.path, title: f.path })),
      ...[...classPreviews.values()]
        .filter((p) => !p.example)
        .map((p) => ({ key: 'preview:' + p.key, title: previewTitle(p) })),
    ],
  });
  const list = el('file-list');
  list.replaceChildren();
  document.querySelectorAll('.workspace .editor-tab').forEach((n) => n.remove());
  renderProjectTree(
    list,
    [
      ...examples.map((f) => ({
        path: f.path,
        key: 'preview:example:' + f.path,
        active: activePreview === 'example:' + f.path,
        open: () => {
          ensureExample(f.path);
          selectClassPreview('example:' + f.path);
        },
      })),
      ...project.files.map((f) => ({
        path: f.path,
        key: 'source:' + f.path,
        active: !!editor.getModel() && !activePreview && f.path === project.workspace.activeFile,
        open: () => switchFile(f.path),
      })),
      ...(jar?.paths ?? []).map((path) => ({
        path: jar!.name + '/' + path,
        key: classPreviews.has('jar:' + path) ? 'preview:jar:' + path : '',
        active: activePreview === 'jar:' + path,
        open: () => void openJarEntry(path),
      })),
      ...(folder?.classFiles ?? []).map((f) => ({
        path: f.path,
        key: '',
        active: activePreview === 'folder:' + f.path,
        open: () => queueClass(() => f.handle.getFile(), 'folder:' + f.path, f.path, true, f.path),
      })),
    ],
    window.jalwebDetached!.workspaceId,
    collapsedFolders,
    {
      create: (directory) => void addFile(directory),
      rename: (path, folder) => void changePath(path, folder, false),
      move: (path, folder) => void changePath(path, folder, true),
    },
  );
  const tabs = visibleTabs(),
    labels = tabLabels(tabs.map((tab) => ({ key: tab.key, path: tab.label })));
  for (const tab of tabs) renderEditorTab(tab, labels.get(tab.key)!);
  panelDock?.refresh();
}
let documentStore: SourceDocuments<monaco.editor.ITextModel, Side> | undefined;
function documents() {
  return (documentStore ??= new SourceDocuments({
    project: () => project,
    models,
    closed: closedSourceTabs,
    groups: sourceGroups,
    order: () => tabOrder,
    setOrder: (order) => {
      tabOrder = order;
    },
    results,
    create: attachModel,
    removeView: (key, model) => {
      for (const view of groupEditors.values())
        if (model && view.getModel() === model) view.setModel(null);
      detached.returnTab(key);
    },
    replaceView: (key, nextKey, model, next) => {
      breakpoints.move(model, next);
      for (const view of groupEditors.values())
        if (view.getModel() === model) {
          const state = view.saveViewState();
          view.setModel(next);
          if (state) view.restoreViewState(state);
        }
      detached.replaceDocument(key, {
        key: nextKey,
        title: nextKey.slice(7),
        model: next,
        readOnly: false,
      });
    },
  }));
}
function attachModel(path: string, source: string) {
  const model = monaco.editor.createModel(
    source,
    'jal',
    monaco.Uri.from({ scheme: 'inmemory', authority: 'jal', path: '/' + path }),
  );
  model.onDidChangeContent(() => {
    scheduleOffsets(model);
    if (!applyingExternal) {
      invalidate();
      setDirty();
    }
  });
  models.set(path, model);
  scheduleOffsets(model);
  return model;
}
function invalidate() {
  revision++;
  checkedRevision = -1;
  updateActions();
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(() => void analyze(), 500);
}
async function installProject(next: Project, binding?: FolderBinding) {
  restoringLayout = true;
  detached.closeAll();
  panelDock?.restore();
  navigation.reset();
  tabOrder = [];
  collapsedFolders.clear();
  sourceGroups.clear();
  for (const view of groupEditors.values()) view.setModel(null);
  activeSide = 'source';
  editor = groupEditors.get('source')!;

  previewEpoch++;
  for (const p of classPreviews.values()) p.model.dispose();
  classPreviews.clear();
  activePreview = undefined;
  folder = binding;
  stopRun(false);
  clearTimeout(analysisTimer);
  revision++;
  checkedRevision = -1;
  editor.setModel(null);
  for (const model of models.values()) model.dispose();
  models = new Map();
  documentStore = undefined;
  project = next;
  closedSourceTabs.clear();
  results.clear();
  for (const f of project.files) attachModel(f.path, f.source);
  editor.updateOptions({ wordWrap: project.workspace.wordWrap ? 'on' : 'off' });
  if (project.workspace.layout) await restorePreviewTabs(project.workspace.layout);
  if (project !== next) return;
  switchFile(project.workspace.activeFile, false);
  setStdin(project.workspace.stdin, false);
  selectTab(project.workspace.panel);
  if (project.workspace.layout) restoreWorkspace(project.workspace.layout);
  queueMicrotask(() => {
    restoringLayout = false;
  });
  el('clear').click();
  el('timing').textContent = '';
  setDirty(false);
  showDiagnostics();
  void analyze();
}
function captureWorkspace(): WorkspaceLayout {
  const selected: WorkspaceLayout['selected'] = {},
    views = { ...project.workspace.views };
  for (const [side, view] of groupEditors) {
    const model = view.getModel(),
      doc = model ? detachableDocument(model.uri.toString()) : undefined;
    if (!doc) continue;
    selected[side] = doc.key;
    const p = view.getPosition();
    if (p)
      views[doc.key.startsWith('source:') ? doc.key.slice(7) : doc.key] = {
        line: p.lineNumber,
        column: p.column,
        scrollTop: Math.round(view.getScrollTop()),
        scrollLeft: Math.round(view.getScrollLeft()),
      };
  }
  const windows = detached.snapshot();
  for (const w of windows)
    for (const [key, v] of Object.entries(w.views))
      views[key.startsWith('source:') ? key.slice(7) : key] = v;
  const keys = [...visibleTabs().map((t) => t.key), ...windows.flatMap((w) => w.tabs)];
  return {
    version: 1,
    order: [...tabOrder],
    tabs: [...new Set(keys)]
      .sort((a, b) => tabOrder.indexOf(a) - tabOrder.indexOf(b))
      .map((key) => ({ key, side: sourceGroups.get(key) ?? 'source' })),
    selected,
    activeSide,
    collapsedFolders: [...collapsedFolders],
    dock: panelDock!.snapshot(),
    windows,
    views,
    wordWrap: project.workspace.wordWrap,
  };
}
async function restorePreviewTabs(layout: WorkspaceLayout) {
  const owner = project,
    epoch = previewEpoch;
  for (const key of new Set([
    ...layout.tabs.map((t) => t.key),
    ...layout.windows.flatMap((w) => w.tabs),
  ])) {
    if (key.startsWith('preview:folder:')) {
      const path = key.slice('preview:folder:'.length),
        file = folder?.classFiles?.find((f) => f.path === path);
      if (file)
        await queueClass(() => file.handle.getFile(), 'folder:' + path, path, false, path, true);
    } else if (key.startsWith('preview:definition:')) {
      try {
        const name = key.slice('preview:definition:'.length),
          model = await navigation.classModel(name.replace(/\.class$/, ''));
        if (project !== owner || epoch !== previewEpoch) return;
        if (model) {
          classPreviews.set(key.slice(8), {
            key: key.slice(8),
            title: name,
            model,
            mtime: 0,
            size: 0,
          });
          scheduleOffsets(model);
        }
      } catch {}
    }
    if (project !== owner || epoch !== previewEpoch) return;
  }
}
function restoreWorkspace(layout: WorkspaceLayout) {
  const available = (key: string) =>
    (key.startsWith('source:') && models.has(key.slice(7))) ||
    (key.startsWith('preview:') && classPreviews.has(key.slice(8)));
  const tabs = layout.tabs.filter((t) => available(t.key));
  tabOrder = layout.order ? [...layout.order] : tabs.map((t) => t.key);
  sourceGroups.clear();
  for (const t of tabs) sourceGroups.set(t.key, t.side);
  closedSourceTabs.clear();
  for (const f of project.files)
    if (!tabs.some((t) => t.key === 'source:' + f.path)) closedSourceTabs.add(f.path);
  collapsedFolders.clear();
  for (const path of layout.collapsedFolders) collapsedFolders.add(path);
  panelDock!.restore(layout.dock);
  detached.restore(layout.windows.map((w) => ({ ...w, tabs: w.tabs.filter(available) })));
  for (const side of layoutSides) {
    const view = groupEditors.get(side)!;
    view.setModel(null);
    view.updateOptions({ wordWrap: layout.wordWrap ? 'on' : 'off' });
    const key = layout.selected[side],
      tab =
        tabs.find((t) => t.side === side && t.key === key && !detached.has(t.key)) ??
        tabs.find((t) => t.side === side && !detached.has(t.key));
    if (!tab) continue;
    const doc = detachableDocument(tab.key);
    if (!doc) continue;
    view.setModel(doc.model);
    view.updateOptions({ readOnly: doc.readOnly });
    const v = layout.views[tab.key.startsWith('source:') ? tab.key.slice(7) : tab.key];
    if (v) {
      view.setPosition(doc.model.validatePosition({ lineNumber: v.line, column: v.column }));
      view.setScrollPosition({ scrollTop: v.scrollTop, scrollLeft: v.scrollLeft });
    }
  }
  activeSide = layout.activeSide;
  editor = groupEditors.get(activeSide)!;
  const model = editor.getModel();
  activePreview = [...classPreviews.values()].find((p) => p.model === model)?.key;
  const path = [...models].find(([, m]) => m === model)?.[0];
  if (path) project.workspace.activeFile = path;
  renderFiles();
  updateActions();
}
function snapshot(): Project {
  const layout = withoutExampleLayout(captureWorkspace());
  return {
    ...project,
    files: project.files.map((f) => ({ path: f.path, source: models.get(f.path)!.getValue() })),
    workspace: { ...project.workspace, layout },
  };
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function storageState(busy: boolean) {
  storageBusy = busy;
  publishWorkspaceAvailability();
  if (busy) status(msg('m8877746a8f94'), 'loading');
  for (const id of [
    'new-project',
    'open-project',
    'open-files',
    'save-project',
    'save-project-as',
    'export-project',
  ])
    menus.disabled(id, busy);
}
function storageError(e: unknown, title: string) {
  if (e instanceof Error && e.name === 'AbortError') {
    status(msg('m7d9e604e0806'));
    return;
  }
  status(title, 'error');
  void dialog(title, e instanceof Error ? e.message : String(e));
}
async function openProjectFolder(requireProperties = false) {
  if (storageBusy) return;
  storageState(true);
  try {
    const root = await pickFolder();
    const loaded = await openFolder(root, requireProperties);
    if (await allowReplace()) await installProject(loaded.project, loaded.binding);
    else status(msg('m7d9e604e0806'));
  } catch (e) {
    storageError(e, msg('mcdd98f9ac910'));
  } finally {
    storageState(false);
  }
}
async function saveProject(saveAs = false) {
  if (storageBusy) return;
  storageState(true);
  try {
    const target =
      !folder || saveAs
        ? { ...newBinding(await pickFolder()), properties: folder?.properties ?? true }
        : folder;
    while (watchBusy) await new Promise((resolve) => setTimeout(resolve, 20));
    const version = changeVersion,
      current = project,
      copy = snapshot();
    try {
      await saveFolder(target, copy);
    } catch (e) {
      if (!folder && target.baseline.size) folder = target;
      throw e;
    }
    folder = target;
    if (project === current && changeVersion === version) setDirty(false);
    status(changeVersion === version ? msg('m4ae43a307956') : msg('ma8a3484ba33d'));
  } catch (e) {
    storageError(e, msg('mc5291a547bd5'));
  } finally {
    storageState(false);
  }
}
async function exportProject() {
  if (storageBusy) return;
  storageState(true);
  try {
    const bytes = await projectArchive(snapshot(), folder?.properties !== false);
    const name = project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'Project';
    download(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }), name + '.zip');
    status(msg('mbd11d2e72230'));
  } catch (e) {
    storageError(e, msg('m38461b63a8bf'));
  } finally {
    storageState(false);
  }
}

async function pollFolder() {
  if (!folder || storageBusy || watchBusy || disposed) return;
  watchBusy = true;
  const binding = folder;
  try {
    const disk = await openFolder(binding.root, false, binding);
    if (folder !== binding || storageBusy || disposed) return;
    let changed = false,
      sourcesChanged = false;
    const conflicts: string[] = [];
    const remote = disk.binding.baseline;
    captureView();
    applyingExternal = true;
    for (const path of new Set([...binding.baseline.keys(), ...remote.keys()])) {
      const old = binding.baseline.get(path),
        next = remote.get(path);
      if (old === next) continue;
      if (!path.endsWith('.jal')) {
        const localProperties = JSON.stringify({
          name: project.name,
          entryFile: project.workspace.entryFile,
        });
        let beforeProperties = localProperties;
        if (old) {
          const p = parseProperties(old);
          beforeProperties = JSON.stringify({ name: p.name, entryFile: p.entryFile });
        }
        if (localProperties !== beforeProperties) {
          conflicts.push(path);
          continue;
        }
        project.name = disk.project.name;
        project.workspace.entryFile = disk.project.workspace.entryFile;
      } else {
        sourcesChanged = true;
        const model = models.get(path),
          local = model?.getValue();
        if (sourceMerge(old, local, next) === 'conflict') {
          conflicts.push(path);
          continue;
        }
        if (next === undefined) {
          documents().remove(path);
        } else if (model) {
          model.setValue(next);
          project.files.find((f) => f.path === path)!.source = next;
        } else {
          documents().add(path, next);
        }
      }
      if (next === undefined) binding.baseline.delete(path);
      else binding.baseline.set(path, next);
      changed = true;
    }
    syncClassFiles(binding, disk.binding.classFiles ?? []);
    binding.cache = disk.binding.cache;
    binding.properties = disk.binding.properties;
    binding.configName = disk.binding.configName;
    if (changed) {
      project.files.sort((a, b) => a.path.localeCompare(b.path));
      if (binding.properties === false && !models.has(project.workspace.entryFile))
        project.workspace.entryFile = disk.project.workspace.entryFile;
      const active = models.has(project.workspace.activeFile)
        ? project.workspace.activeFile
        : (project.files[0]?.path ?? '');
      if (
        !sourcesChanged ||
        activePreview ||
        closedSourceTabs.has(active) ||
        detached.has('source:' + active)
      )
        renderFiles();
      else switchFile(active, false);
      setDirty(dirty);
      invalidate();
      if (!running) status(msg('m72ea8d310b87'));
    }
    if (conflicts.length) status(msg('m1c8e4e125589', [conflicts.join(', ')]), 'error');
  } catch (e) {
    if (folder === binding && !storageBusy)
      status(msg('mef930ebfe351', [e instanceof Error ? e.message : String(e)]), 'error');
  } finally {
    applyingExternal = false;
    watchBusy = false;
  }
}
const folderWatch = setInterval(() => void pollFolder(), 1000);

function selectClassPreview(key: string) {
  if (detached.has('preview:' + key)) {
    detached.focus('preview:' + key);
    return;
  }

  captureView();
  activeSide = sourceGroups.get('preview:' + key) ?? 'source';
  editor = groupEditors.get(activeSide)!;
  panelDock?.showSource(activeSide);
  const preview = classPreviews.get(key);
  if (!preview) return;
  activePreview = key;
  editor.setModel(preview.model);
  editor.updateOptions({ readOnly: !preview.example && !preview.editable });
  renderFiles();
  updateActions();
}
interface EditorTab {
  key: string;
  label: string;
  active: boolean;
  sourcePath?: string;
  previewKey?: string;
}
function visibleTabs(): EditorTab[] {
  const tabs: EditorTab[] = [
    ...project.files
      .filter((f) => !closedSourceTabs.has(f.path))
      .map((f) => ({
        key: 'source:' + f.path,
        label: f.path,
        sourcePath: f.path,
        active: !activePreview && editor.getModel() === models.get(f.path),
      })),
    ...[...classPreviews.values()].map((p) => ({
      key: 'preview:' + p.key,
      label: previewTitle(p),
      previewKey: p.key,
      active: activePreview === p.key,
    })),
  ];
  for (const tab of tabs) if (!tabOrder.includes(tab.key)) tabOrder.push(tab.key);
  return tabs
    .filter((t) => !detached.has(t.key))
    .sort((a, b) => tabOrder.indexOf(a.key) - tabOrder.indexOf(b.key));
}
function selectEditorTab(tab: EditorTab) {
  if (tab.sourcePath !== undefined) switchFile(tab.sourcePath);
  else selectClassPreview(tab.previewKey!);
}
function closeEditorTabs(key: string, others = false) {
  const side = sourceGroups.get(key) ?? 'source';
  const tabs = visibleTabs().filter((t) => (sourceGroups.get(t.key) ?? 'source') === side),
    index = tabs.findIndex((t) => t.key === key);
  if (index < 0) return;
  const removed = tabs.filter((t) => (others ? t.key !== key : t.key === key)),
    remaining = tabs.filter((t) => !removed.includes(t));
  const next = others
    ? tabs[index]
    : (remaining.find((t) => t.active) ?? remaining[Math.min(index, remaining.length - 1)]);
  captureView();
  for (const tab of removed) {
    if (
      groupEditors.get(side)?.getModel() ===
      (tab.sourcePath !== undefined
        ? models.get(tab.sourcePath)
        : classPreviews.get(tab.previewKey!)?.model)
    )
      groupEditors.get(side)!.setModel(null);
    if (tab.sourcePath !== undefined) closedSourceTabs.add(tab.sourcePath);
    else {
      const p = classPreviews.get(tab.previewKey!);
      if (p) {
        if (editor.getModel() === p.model) editor.setModel(null);
        classPreviews.delete(p.key);
        if (p.model.uri.authority !== 'definition') p.model.dispose();
      }
    }
  }
  if (next) selectEditorTab(next);
  else {
    groupEditors.get(side)!.setModel(null);
    if (activeSide === side) activePreview = undefined;
    renderFiles();
    updateActions();
  }
}
function closeClassPreview(key: string) {
  closeEditorTabs('preview:' + key);
}
function renderEditorTab(item: EditorTab, label: string) {
  const side = sourceGroups.get(item.key) ?? 'source';
  const view = groupEditors.get(side)!;
  item.active =
    view.getModel() ===
    (item.sourcePath !== undefined
      ? models.get(item.sourcePath)
      : classPreviews.get(item.previewKey!)?.model);
  const pane = new EditorPane(item.key, item.label, {
    select: () => selectEditorTab(item),
    close: (others) => {
      if (others) panelDock?.closeTools(side);
      closeEditorTabs(item.key, others);
    },
  });
  const { wrapper } = paneTab(
    pane,
    window.jalwebDetached!.workspaceId,
    item.active,
    undefined,
    label,
  );
  (panelDock?.strips[side] ?? el('file-tabs')).append(wrapper);
}
function detachEditorTab(item: EditorTab) {
  const model =
    item.sourcePath !== undefined
      ? models.get(item.sourcePath)
      : classPreviews.get(item.previewKey!)?.model;
  if (!model || model.isDisposed()) return;
  if (
    !detached.open(
      item.key,
      item.label,
      model,
      item.previewKey !== undefined &&
        !classPreviews.get(item.previewKey)?.example &&
        !classPreviews.get(item.previewKey)?.editable,
    )
  ) {
    status(msg('mffebddbf6521'), 'error');
    document.getElementById('detach-retry')?.remove();
    const retry = document.createElement('button');
    retry.id = 'detach-retry';
    retry.textContent = msg('m8af85266ba4f');
    retry.onclick = () => {
      retry.remove();
      detachEditorTab(item);
    };
    document.querySelector('.source-header')!.append(retry);
    return;
  }
  document.getElementById('detach-retry')?.remove();
  captureView();
  const side = sourceGroups.get(item.key) ?? 'source';
  const view = groupEditors.get(side)!;
  if (view.getModel() === model) {
    view.setModel(null);
    const next = visibleTabs().find((t) => (sourceGroups.get(t.key) ?? 'source') === side);
    if (next) selectEditorTab(next);
    else if (activeSide === side) activePreview = undefined;
  }
  renderFiles();
  updateActions();
  status(msg('m79b0173358e5'));
}
function movePane(key: string, side: Side, event: DragEvent) {
  const pane = paneIdentity(key);
  if (!pane) return;
  const before = beforePane(panelDock!.strips[side], key, event.clientX);
  movePaneOrder(tabOrder, key, before);
  if (pane.kind === 'tool') {
    detached.returnPanel(pane.name);
    panelDock!.move(pane.name, side);
  } else moveSource(key, side);
}
function moveSource(key: string, side: Side) {
  const doc = detachableDocument(key);
  if (!doc) return;
  const transferred = detached.has(key) ? detached.returnTab(key) : undefined;
  if (transferred && key.startsWith('source:')) project.workspace.views[key.slice(7)] = transferred;
  const old = sourceGroups.get(key) ?? 'source';
  sourceGroups.set(key, side);
  if (old !== side && groupEditors.get(old)?.getModel() === doc.model) {
    groupEditors.get(old)!.setModel(null);
    const next = visibleTabs().find(
      (t) => (sourceGroups.get(t.key) ?? 'source') === old && t.key !== key,
    );
    if (next) selectEditorTab(next);
  }
  if (key.startsWith('source:')) switchFile(key.slice(7));
  else {
    selectClassPreview(key.slice(8));
    if (transferred) {
      editor.setPosition({ lineNumber: transferred.line, column: transferred.column });
      editor.setScrollPosition({
        scrollTop: transferred.scrollTop,
        scrollLeft: transferred.scrollLeft,
      });
    }
  }
  editor.focus();
}
function bindGroupEditor(view: monaco.editor.IStandaloneCodeEditor, side: Side) {
  const follow = () => {
    const model = view.getModel(),
      p = view.getPosition();
    if (model) graphFocus(model, p?.lineNumber, p?.column);
  };
  groupResources.push(
    view.onDidChangeModel(follow),
    view.onDidFocusEditorText(follow),
    view.onDidChangeCursorPosition(follow),
    view.onDidChangeModelContent(follow),
  );

  view.onDidFocusEditorText(() => {
    if (editor === view) return;
    captureView();
    editor = view;
    activeSide = side;
    const model = view.getModel(),
      path = [...models].find(([, m]) => m === model)?.[0];
    if (path) {
      project.workspace.activeFile = path;
      activePreview = undefined;
    } else activePreview = [...classPreviews.values()].find((p) => p.model === model)?.key;
    renderFiles();
    updateActions();
  });
  const debug = installDebugEditor(
    view,
    () => workspaceState.value.debug,
    toggleBreakpoint,
    (name) => debugSources.get(name),
  );
  debugEditors.push(debug);
  groupResources.push(debug);
  view.onDidChangeModel(() => refreshOffsets(view));
  if (side === 'source') return;
  groupResources.push(
    installStackHover(view, compileModel),
    followInstructionClicks(view, (op) => {
      instructionPanel.showInstruction(op);
      detached.showInstruction(op);
    }),
  );
  view.onDidChangeCursorPosition(({ position }) => {
    el('cursor').textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
  });
  groupResources.push(installEditorCommands(view, () => void run()));
}

async function closeJar(force = false) {
  if (!jar || jarBusy) return false;
  if (
    !force &&
    jar.dirty &&
    (await dialog(msg('jar.discard'), msg('jar.unsaved'), undefined, true)) === null
  )
    return false;
  for (const preview of [...classPreviews.values()])
    if (preview.jarEntry) {
      detached.returnTab('preview:' + preview.key);
      closeClassPreview(preview.key);
    }
  jar = undefined;
  renderFiles();
  updateActions();
  return true;
}
async function openJar(file: File) {
  if (jarBusy) return;
  const { JarArchive } = await import('./jar-archive');
  const archive = await JarArchive.open(file);
  if (jar && !(await closeJar())) return;
  jar = archive;
  renderFiles();
  updateActions();
  const first = archive.paths.find((path) => path.endsWith('.class')) ?? archive.paths[0];
  if (first) return openJarEntry(first);
}
async function openJarEntry(path: string) {
  const archive = jar;
  if (!archive || !Object.hasOwn(archive.entries, path)) return;
  const key = 'jar:' + path;
  if (classPreviews.has(key)) {
    selectClassPreview(key);
    return 'preview:' + key;
  }
  try {
    if (classPreviews.size >= 16) throw Error(msg('ma5ae4b723858'));
    const { jarResource } = await import('./jar-archive');
    const isClass = path.endsWith('.class');
    if (isClass) status(msg('jar.opening'), 'loading');
    const source = isClass
      ? await archive.source(path, (bytes) => compilationService.disassemble(bytes))
      : undefined;
    if (archive !== jar) return;
    // Two views may request the same entry while disassembly is pending.
    if (!classPreviews.has(key)) {
      const model = monaco.editor.createModel(
        source?.source ?? jarResource(archive.entries[path]),
        isClass ? 'jal' : 'plaintext',
        monaco.Uri.from({
          scheme: 'inmemory',
          authority: 'jar',
          path: '/' + ++dropSequence + (isClass ? '.jal' : '.txt'),
        }),
      );
      classPreviews.set(key, {
        key,
        title: archive.name + '/' + path,
        model,
        jarEntry: path,
        editable: isClass,
        mtime: 0,
        size: archive.entries[path].length,
      });
      if (source) {
        model.onDidChangeContent(() => {
          source.source = model.getValue();
          scheduleOffsets(model);
          monaco.editor.setModelMarkers(model, 'jal', []);
          updateActions();
        });
        scheduleOffsets(model);
      }
    }
    selectClassPreview(key);
    status(msg('m642ad04c5c40'));
    return 'preview:' + key;
  } catch (error) {
    storageError(error, path);
  }
}
async function downloadJar() {
  const archive = jar;
  if (!archive || jarBusy) return;
  jarBusy = true;
  updateActions();
  status(msg('jar.exporting'), 'loading');
  try {
    const result = await archive.export((document, source) =>
      compilationService.compile(document, source, undefined, {}),
    );
    if (archive !== jar) return;
    download(
      new Blob([new Uint8Array(result.bytes)], { type: 'application/java-archive' }),
      archive.name,
    );
    result.saved();
    status(msg('m642ad04c5c40'));
  } catch (error) {
    storageError(error, msg('jar.exportError'));
  } finally {
    jarBusy = false;
    updateActions();
  }
}

function queueClass(
  getFile: () => Promise<File>,
  key: string,
  title: string,
  select = true,
  folderPath?: string,
  silent = false,
) {
  const epoch = previewEpoch;
  classQueue = classQueue.then(async () => {
    if (epoch !== previewEpoch) return;
    try {
      const file = await getFile();
      if (file.size > 1024 * 1024) throw new Error(msg('m7c7094415719'));
      const old = classPreviews.get(key);
      if (old && old.mtime === file.lastModified && old.size === file.size) {
        if (select) selectClassPreview(key);
        return;
      }
      if (!old && classPreviews.size >= 16) throw new Error(msg('ma5ae4b723858'));
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (
        bytes.length < 10 ||
        bytes[0] !== 0xca ||
        bytes[1] !== 0xfe ||
        bytes[2] !== 0xba ||
        bytes[3] !== 0xbe
      )
        throw new Error(msg('m68b13d02975b'));
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      if (!silent) status(title + msg('m9374e8ba6346'), 'loading');
      const result = await compilationService.disassemble(btoa(binary));
      if (
        epoch !== previewEpoch ||
        (old && classPreviews.get(key) !== old) ||
        (folderPath && !folder?.classFiles?.some((f) => f.path === folderPath))
      )
        return;
      if (
        typeof result.source !== 'string' ||
        new TextEncoder().encode(result.source).length > 1024 * 1024
      )
        throw new Error(msg('me81bf6a4c559'));
      const model =
        old?.model ??
        monaco.editor.createModel(
          result.source,
          'jal',
          monaco.Uri.from({
            scheme: 'inmemory',
            authority: 'class-preview',
            path: '/' + ++dropSequence + '.jal',
          }),
        );
      if (old) model.setValue(result.source);
      classPreviews.set(key, {
        key,
        title,
        model,
        folderPath,
        mtime: file.lastModified,
        size: file.size,
      });
      scheduleOffsets(model);
      if (select || activePreview === key) selectClassPreview(key);
      else if (!silent) renderFiles();
      if (!silent) status(msg('m642ad04c5c40'));
    } catch (e) {
      if (!silent && epoch === previewEpoch) {
        status(msg('md745c6b85e47'), 'error');
        await dialog(title + msg('mcdabe1224c3d'), e instanceof Error ? e.message : String(e));
      }
    }
  });
  return classQueue;
}
function syncClassFiles(binding: FolderBinding, files: ClassFileEntry[]) {
  const previous = binding.classFiles ?? [];
  binding.classFiles = files;
  for (const p of [...classPreviews.values()])
    if (p.folderPath) {
      const next = files.find((f) => f.path === p.folderPath);
      if (!next) closeClassPreview(p.key);
      else if (next.mtime !== p.mtime || next.size !== p.size)
        queueClass(() => next.handle.getFile(), p.key, p.title, false, p.folderPath);
    }
  if (previous.length !== files.length || previous.some((f, i) => f.path !== files[i]?.path))
    renderFiles();
}
async function openFiles(files: File[]): Promise<string[]> {
  if (storageBusy) return [];
  if (files.length > 64) {
    await dialog(msg('m5d6c611f808f'), msg('m380caa4874b5'));
    return [];
  }
  if (files.some((file) => fileKind(file.name) === 'project')) {
    if (files.length !== 1) {
      await dialog(msg('m1d25ade4db27'), msg('m7373ee74be3e'));
      return [];
    }
    const file = files[0];
    try {
      if (file.size > 65536) throw new Error(msg('m3be3f7e999c7'));
      const text = await file.text();
      parseProperties(text);
      if (
        (await dialog(
          msg('m1d25ade4db27'),
          msg('m2acaf802780a') + file.name + msg('mfc08eaee47db'),
          undefined,
          true,
          msg('m6985b2151ba8'),
        )) === null
      )
        return [];
      storageState(true);
      const root = await pickFolder(),
        loaded = await openFolder(root, true);
      if (
        loaded.binding.configName !== file.name ||
        loaded.binding.baseline.get(file.name) !== text
      )
        throw new Error(msg('m8172fe61f0fc'));
      if (await allowReplace()) await installProject(loaded.project, loaded.binding);
    } catch (e) {
      storageError(e, msg('m8476ce1c484f'));
    } finally {
      storageState(false);
    }
    return [];
  }
  const owner = project,
    opened: string[] = [];
  for (const file of files) {
    if (project !== owner) break;
    try {
      const kind = fileKind(file.name);
      if (kind === 'jar') {
        const key = await openJar(file);
        if (key) opened.push(key);
      } else if (kind === 'class') {
        const key = 'drop:' + ++dropSequence;
        await queueClass(async () => file, key, file.name);
        if (project === owner && classPreviews.has(key)) opened.push('preview:' + key);
      } else if (kind === 'source') {
        if (file.size > 1024 * 1024) throw new Error(msg('mc1c50ef487cf'));
        const source = await file.text();
        if (project !== owner) break;
        let path = 'src/' + file.name.replace(/\.jal$/i, '.jal');
        if (project.files.some((f) => f.path.toLowerCase() === path.toLowerCase())) {
          const selected = await dialog(
            msg('m18fdff41665a'),
            msg('mfa292d611b8d'),
            path.replace(/\.jal$/, '_2.jal'),
          );
          if (selected === null) continue;
          path = selected;
        }
        if (project !== owner) break;
        validatePath(path);
        if (project.files.some((f) => f.path.toLowerCase() === path.toLowerCase()))
          throw new Error(msg('md437709a0aed'));
        const copy = snapshot();
        copy.files.push({ path, source });
        if (copy.files.length === 1)
          copy.workspace = { ...copy.workspace, activeFile: path, entryFile: path };
        validateProject(copy);
        documents().add(path, source);
        switchFile(path);
        invalidate();
        setDirty();
        opened.push('source:' + path);
      } else throw new Error(msg('m7950add9a759'));
    } catch (e) {
      await dialog(file.name + msg('mcdabe1224c3d'), e instanceof Error ? e.message : String(e));
    }
  }
  return opened;
}
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
});
window.addEventListener('drop', (e) => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    void openFiles([...e.dataTransfer.files]);
  }
});

async function downloadClass() {
  const model = editor.getModel(),
    example = model?.uri.authority === 'example';
  const c = example ? await compileExample(model!) : results.get(project.workspace.activeFile);
  if ((!example && checkedRevision !== revision) || !c?.bytecode) return;
  download(
    new Blob([Uint8Array.from(atob(c.bytecode), (x) => x.charCodeAt(0))], {
      type: 'application/java-vm',
    }),
    c.className.split('/').pop() + '.class',
  );
}
function dialog(
  title: string,
  message: string,
  input?: string,
  confirm = false,
  confirmLabel = msg('m79a5956d251c'),
  suffix = '',
): Promise<string | null> {
  const d = el<HTMLDialogElement>('dialog');
  if (d.open) return Promise.resolve(null);
  el('dialog-title').textContent = title;
  el('dialog-message').textContent = message;
  const field = el<HTMLInputElement>('dialog-input');
  field.hidden = input === undefined;
  field.value = input ?? '';
  el('dialog-input-row').hidden = input === undefined;
  el('dialog-suffix').hidden = !suffix;
  el('dialog-suffix').textContent = suffix;
  if (suffix) field.setAttribute('aria-describedby', 'dialog-suffix');
  else field.removeAttribute('aria-describedby');
  el('dialog-cancel').hidden = input === undefined && !confirm;
  el('dialog-cancel').onclick = () => d.close('cancel');
  el('dialog-ok').textContent = confirm ? confirmLabel : 'OK';
  d.returnValue = '';
  d.showModal();
  if (input !== undefined) {
    field.focus();
    field.select();
  } else el(confirm ? 'dialog-cancel' : 'dialog-ok').focus();
  return new Promise((resolve) =>
    d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? field.value : null), {
      once: true,
    }),
  );
}
async function allowReplace() {
  return (
    !dirty || (await dialog(msg('m946c28fb4132'), msg('m0fff9379ab08'), undefined, true)) !== null
  );
}
async function newProject() {
  if (!storageBusy && (await allowReplace())) await installProject(defaultProject());
}
function openProperties() {
  const d = el<HTMLDialogElement>('project-properties');
  if (d.open) return;
  el<HTMLInputElement>('properties-name').value = project.name;
  el<HTMLInputElement>('properties-name').setCustomValidity('');
  const select = el<HTMLSelectElement>('entry-file');
  select.replaceChildren();
  for (const file of project.files) {
    const option = document.createElement('option');
    option.value = file.path;
    option.textContent = file.path;
    select.append(option);
  }
  select.value = project.workspace.entryFile;
  d.showModal();
  el('properties-name').focus();
}
el('summary-properties').onclick = openProperties;
el('properties-cancel').onclick = () => el<HTMLDialogElement>('project-properties').close();
el('properties-form').onsubmit = (e) => {
  e.preventDefault();
  const field = el<HTMLInputElement>('properties-name'),
    name = field.value.trim();
  field.setCustomValidity(name ? '' : msg('m7578a188e521'));
  if (!field.reportValidity()) return;
  const entry = el<HTMLSelectElement>('entry-file').value;
  if (!project.files.some((f) => f.path === entry)) return;
  if (project.name !== name || project.workspace.entryFile !== entry) {
    project.name = name;
    project.workspace.entryFile = entry;
    setDirty();
  }
  el<HTMLDialogElement>('project-properties').close();
};
el<HTMLInputElement>('properties-name').oninput = () =>
  el<HTMLInputElement>('properties-name').setCustomValidity('');
async function addFile(directory = 'src') {
  const owner = project;
  const name = await dialog(
    msg('m74449f8523d7'),
    msg('mcfc10df6467e'),
    (directory ? directory + '/' : '') + 'Helper',
    false,
    '',
    '.jal',
  );
  if (name === null || project !== owner) return;
  const path =
    name
      .trim()
      .replace(/\.jal$/i, '')
      .replaceAll('.', '/') + '.jal';
  try {
    if (path === '.jal') throw new Error(msg('m4d23aa128765'));
    validatePath(path);
    if (project.files.length >= 64) throw new Error(msg('mcafda533f3d0'));
    if (project.files.some((f) => f.path.toLowerCase() === path.toLowerCase()))
      throw new Error(msg('m0fc670fbc8c3'));
  } catch (e) {
    await dialog(msg('m02a8252f7eb7'), String(e instanceof Error ? e.message : e));
    return;
  }
  const className = path
    .replace(/^src\//, '')
    .slice(0, -4)
    .replace(/[^a-zA-Z0-9_$/]/g, '_')
    .replace(/(^|\/)(?=\d)/g, '$1_');
  documents().add(path, `public class ${className} {\n}\n`);
  switchFile(path);
  invalidate();
  setDirty();
  editor.focus();
}
async function renameFile() {
  if (!activePreview && project.workspace.activeFile)
    await changePath(project.workspace.activeFile, false, false);
}
function projectAction(action: 'create' | 'rename' | 'move', path: string, isFolder: boolean) {
  window.focus();
  if (action === 'create') void addFile(path);
  else void changePath(path, isFolder, action === 'move');
}
async function changePath(old: string, isFolder: boolean, move: boolean) {
  const owner = project,
    parent = old.split('/').slice(0, -1).join('/'),
    base = old.split('/').pop()!;
  const input = await dialog(
    move ? msg('m2fd3f389d498') : isFolder ? msg('m83a637816e2f') : msg('m21ecfa3428e8'),
    move ? msg('m214c81b69001') : msg('m90fcccddecc5'),
    move ? parent : isFolder ? base : base.replace(/\.jal$/i, ''),
    false,
    '',
    !move && !isFolder ? '.jal' : '',
  );
  if (input === null || project !== owner) return;
  const name = input.trim().replaceAll('\\', '/');
  const destination = move
    ? (name ? name.replace(/\/$/, '') + '/' : '') + base
    : (parent ? parent + '/' : '') +
      (isFolder ? name : name.replace(/\.jal$/i, '').replaceAll('.', '/') + '.jal');
  if (destination === old) return;
  try {
    if (!move && !name) throw new Error(msg('m64fa16304152'));
    const paths = project.files.map((f) => f.path),
      changes = planPathChange(paths, old, destination, isFolder);
    if (
      folder?.classFiles?.some((f) =>
        [...changes.values()].some(
          (path) =>
            path.toLowerCase() === f.path.toLowerCase() ||
            path.toLowerCase().startsWith(f.path.toLowerCase() + '/'),
        ),
      )
    )
      throw new Error(msg('m00d100ab4b93'));
    captureView();
    for (const [from, to] of changes) documents().rename(from, to);
    if (isFolder) {
      for (const path of [...collapsedFolders])
        if (path === old || path.startsWith(old + '/')) {
          collapsedFolders.delete(path);
          collapsedFolders.add(destination + path.slice(old.length));
        }
    }
    renderFiles();
    invalidate();
    setDirty();
    updateActions();
  } catch (error) {
    await dialog(msg('maa8b870b5410'), error instanceof Error ? error.message : String(error));
  }
}
async function removeFile() {
  if (activePreview) return;
  if (project.files.length <= 1) return;
  const path = project.workspace.activeFile;
  if ((await dialog(msg('m7ea5e4d1250b'), msg('md75b21712bbf', [path]), undefined, true)) === null)
    return;
  documents().remove(path);
  switchFile(project.workspace.activeFile, false);
  invalidate();
  setDirty();
}
el('add-file').onclick = () => void addFile();
function setStdin(text: string, edited = true) {
  project.workspace.stdin = text;
  workspaceState.updateTools({ stdin: text });
  el<HTMLTextAreaElement>('stdin').value = text;
  if (edited) setDirty();
}
el<HTMLTextAreaElement>('stdin').oninput = () => setStdin(el<HTMLTextAreaElement>('stdin').value);
function output(text: string, stream = 'stdout') {
  workspaceState.updateTools({ output: [...workspaceState.value.tools.output, { text, stream }] });
  el('console-empty').hidden = true;
  const span = document.createElement('span');
  span.className = stream;
  span.textContent = text;
  el('output').append(span);
  const scroller = document.querySelector<HTMLElement>('.dock-console-body') ?? el('console-panel');
  scroller.scrollTop = scroller.scrollHeight;
}
const instructionPanel = installInstructionsPanel(el('instructions-panel'), compileUsage);
const debugPanel = installDebugPanel(el('debug-panel'), debugActions);
const debugKeys = installDebugKeys(debugActions);
const unsubscribeDebug = workspaceState.subscribe(() => {
  debugPanel.update(workspaceState.value.debug);
  for (const view of debugEditors) view.update();
});
debugPanel.update(workspaceState.value.debug);
const graphPanel = installInstructionGraph(el('graph-panel'), graphCompilation, graphNavigate);
const unsubscribeGraph = workspaceState.subscribe(() =>
  graphPanel.update(workspaceState.value.graphDocument),
);
if (editor.getModel())
  graphFocus(editor.getModel()!, editor.getPosition()?.lineNumber, editor.getPosition()?.column);
const instructionClicks = followInstructionClicks(editor, (op) => {
  instructionPanel.showInstruction(op);
  detached.showInstruction(op);
});
panelDock = installPanelDock(
  (name) => {
    project.workspace.panel = name;
  },
  () => {
    for (const view of groupEditors.values()) view.layout();
  },
  (side) => {
    for (const tab of visibleTabs().filter((t) => (sourceGroups.get(t.key) ?? 'source') === side))
      closeEditorTabs(tab.key);
  },
  (name) => {
    if (!detached.openPanel(name)) status(msg('ma13ecae5cbbc'), 'error');
  },
  window.jalwebDetached!.workspaceId,
  () => tabOrder,
  (name) =>
    name === 'project' ? [{ label: msg('md3a91edcf75f'), action: () => void addFile() }, null] : [],
);
for (const side of ['project', 'output'] as const) {
  const container = document.createElement('div');
  container.className = 'group-editor';
  container.hidden = true;
  panelDock.panes[side].append(container);
  const view = monaco.editor.create(container, {
    ...editor.getRawOptions(),
    model: null,
    automaticLayout: true,
    ariaLabel: side + msg('m5f0e090a4cfe'),
  });
  groupEditors.set(side, view);
  bindGroupEditor(view, side);
}
bindGroupEditor(groupEditors.get('source')!, 'source');
for (const side of ['project', 'source', 'output'] as const)
  groupResources.push(
    paneDrop(panelDock.panes[side], window.jalwebDetached!.workspaceId, (key, event) =>
      movePane(key, side, event),
    ),
  );
const detachPane = (key: string) => {
  const pane = paneIdentity(key);
  if (pane?.kind === 'tool') {
    if (!detached.hasPanel(pane.name)) detached.openPanel(pane.name);
  } else if (pane?.kind === 'editor') {
    const tab = visibleTabs().find((t) => t.key === key);
    if (tab) detachEditorTab(tab);
  }
};
groupResources.push(
  paneDrop(document.body, window.jalwebDetached!.workspaceId, detachPane),
  paneWindowExit(window.jalwebDetached!.workspaceId, detachPane),
);
function selectTab(tab: 'project' | 'console' | 'problems' | 'instructions' | 'graph' | 'debug') {
  if (detached.hasPanel(tab)) detached.focusPanel(tab);
  else panelDock?.show(tab);
}
groupResources.push(
  installConsoleContextMenu(el('console-panel'), el('output'), () => el('clear').click()),
  installProblemsContextMenu(el('problems-panel')),
);
el('clear').onclick = () => {
  workspaceState.updateTools({ output: [] });
  el('output').textContent = '';
  el('console-empty').hidden = false;
};
function showDiagnostics() {
  const problems: { label: string; severity: string }[] = [];
  el('problems').replaceChildren();
  problemTargets = [];
  let count = 0;
  for (const [path, model] of models) {
    const items = results.get(path)?.diagnostics ?? [];
    count += items.length;
    monaco.editor.setModelMarkers(
      model,
      'jal',
      items.map((d) => {
        const p = model.validatePosition({ lineNumber: d.line, column: d.column });
        return {
          severity:
            d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: d.message,
          startLineNumber: p.lineNumber,
          startColumn: p.column,
          endLineNumber: p.lineNumber,
          endColumn: Math.min(
            model.getLineMaxColumn(p.lineNumber),
            p.column + Math.max(1, d.length),
          ),
          source: 'JAL',
        };
      }),
    );
    const inspections = currentInspections(model).map((i) => {
      const p = model.getPositionAt(i.start);
      return { message: i.message, severity: i.severity, line: p.lineNumber, column: p.column };
    });
    count += inspections.length;
    for (const d of [...items, ...inspections]) {
      problemTargets.push({ path, line: d.line, column: d.column });
      const label = `${path}:${d.line}:${d.column}  ${d.message}`;
      problems.push({ label, severity: d.severity });
      const li = document.createElement('li'),
        b = document.createElement('button');
      b.className = d.severity;
      b.textContent = label;
      b.onclick = () => {
        if (detached.has('source:' + path)) {
          detached.focus('source:' + path);
          return;
        }
        switchFile(path);
        editor.setPosition(model.validatePosition({ lineNumber: d.line, column: d.column }));
        editor.revealLineInCenter(d.line);
        editor.focus();
      };
      li.append(b);
      el('problems').append(li);
    }
  }
  workspaceState.updateTools({ problems });
  el('problem-count').textContent = String(count);
  const empty = document.querySelector<HTMLElement>('.empty-problems')!;
  empty.hidden = count > 0;
  empty.textContent = msg('mdaaed0138661');
}
function hasErrors() {
  return [...results.values()].some((c) => c.diagnostics.some((d) => d.severity === 'error'));
}
compiler.onProgress = (loaded) => {
  if (!running) status(msg('m859821d20656', [(loaded / 1024 / 1024).toFixed(1)]), 'loading');
};
async function analyze(): Promise<void> {
  if (disposed) return;
  if (analysisPromise) return analysisPromise;
  analysisPromise = (async () => {
    let checked = -1;
    while (checked !== revision && !disposed) {
      checked = revision;
      const sources = [...models].map(([path, m]) => ({ path, model: m, source: m.getValue() }));
      if (!running) status(msg('m5ca5e75fb40a'), 'loading');
      try {
        const next = new Map<string, Compilation>();
        for (const f of sources) {
          const c = await compilationService.compile(f.model, f.source, undefined, {});
          if (checked !== revision) break;
          next.set(f.path, { ...c, diagnostics: [...c.diagnostics] });
        }
        if (checked !== revision) continue;
        const classes = new Map<string, string[]>();
        for (const [path, c] of next)
          if (c.bytecode) classes.set(c.className, [...(classes.get(c.className) ?? []), path]);
        for (const [name, paths] of classes)
          if (paths.length > 1)
            for (const path of paths)
              next.get(path)!.diagnostics.push({
                severity: 'error',
                message: msg('mbd6497361b54', [name, paths.join(', ')]),
                line: 1,
                column: 1,
                length: 1,
              });
        results = next;
        checkedRevision = checked;
        showDiagnostics();
        updateActions();
        if (!running)
          status(
            hasErrors() ? msg('m428b24c11fc6') : msg('mc2c1724a78a8'),
            hasErrors() ? 'error' : 'ready',
          );
      } catch (e) {
        if (checked !== revision) continue;
        checkedRevision = -1;
        updateActions();
        if (!running) status(e instanceof Error ? e.message : String(e), 'error');
        break;
      }
    }
  })().finally(() => {
    analysisPromise = undefined;
  });
  return analysisPromise;
}
editor.onDidChangeCursorPosition(({ position }) => {
  el('cursor').textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
  el('instruction-hint').textContent = msg('m90f066b614d2');
});
function stopRun(show = true) {
  debugState({ status: 'finished', snapshot: undefined, previous: undefined });
  runToken++;
  runner?.stop();
  runner = undefined;
  running = false;
  updateActions();
  if (show) status(msg('m4d87a69ae687'));
}
async function run(requestedModel?: monaco.editor.ITextModel, debugging = true) {
  const model = requestedModel ?? editor.getModel(),
    example = model?.uri.authority === 'example';
  if (running) {
    stopRun();
    return;
  }
  const unavailable = runUnavailable(model);
  if (unavailable) {
    status(unavailable);
    return;
  }
  running = true;
  const token = ++runToken;
  updateActions();
  let owned: Runtime | undefined;
  const started = performance.now();
  const debugDisposals: monaco.IDisposable[] = [];
  if (debugging) debugState({ status: 'starting', snapshot: undefined, previous: undefined });
  el('clear').click();
  el('console-empty').hidden = true;
  selectTab('console');
  status(msg('m405e2aafb5c8'), 'loading');
  try {
    let entry: Compilation | undefined, classes: Compilation[];
    if (example) {
      entry = await compileExample(model!);
      classes = entry.bytecode ? [entry] : [];
    } else {
      clearTimeout(analysisTimer);
      await analyze();
      if (token !== runToken) return;
      if (checkedRevision !== revision) throw new Error(msg('m2ebbfe857338'));
      if (hasErrors()) {
        selectTab('problems');
        status(msg('m428b24c11fc6'), 'error');
        return;
      }
      entry = results.get(project.workspace.entryFile);
      classes = [...results.values()];
    }
    if (token !== runToken) return;
    if (!entry?.bytecode)
      throw new Error(entry?.diagnostics.map((d) => d.message).join('\n') || msg('mf5cd797ea235'));
    owned = new Runtime(memory.executionHeapMiB);
    runner = owned;
    owned.onOutput = (stream, text) => {
      if (token === runToken) output(text, stream);
    };
    owned.onProgress = (loaded) => {
      if (token === runToken)
        status(msg('md6805dd1fc8f', [(loaded / 1024 / 1024).toFixed(1)]), 'loading');
    };
    if (debugging) {
      debugSources.clear();
      if (example) debugSources.set(entry.className, model!.uri.toString());
      else
        for (const [path, c] of results) {
          const m = models.get(path);
          if (m) debugSources.set(c.className, m.uri.toString());
        }
      for (const uri of debugSources.values()) {
        const m = monaco.editor.getModel(monaco.Uri.parse(uri));
        if (m)
          debugDisposals.push(
            m.onDidChangeContent(() => {
              if (token !== runToken) return;
              stopRun(false);
              status(msg('m27b0fbbf124a'));
            }),
            m.onWillDispose(() => {
              if (token === runToken) stopRun(false);
            }),
          );
      }
      owned.onDebug = (snapshot) => {
        if (token !== runToken) return;
        debugState({
          status: 'paused',
          instructionLocation: undefined,
          previous: workspaceState.value.debug?.snapshot,
          snapshot,
        });
        status(
          msg('m7156a0f5bbad', [
            snapshot.location.className,
            snapshot.location.method,
            snapshot.location.pc,
          ]),
        );
        selectTab('debug');
        void revealDebugFrame(snapshot.frames[0]);
      };
      debugState({ documents: Object.fromEntries(debugSources) });
      owned.onDebugReady = async () => {
        if (token !== runToken) return;
        try {
          await owned!.debugBreakpoints(runtimeBreakpoints());
          if (token === runToken) debugState({ status: 'running' });
        } catch (e) {
          if (token === runToken) {
            stopRun(false);
            status(e instanceof Error ? e.message : String(e), 'error');
          }
        }
      };
    }
    await owned.run(
      { ...entry, classes: classes.map((c) => ({ className: c.className, bytecode: c.bytecode })) },
      project.workspace.stdin,
      debugging
        ? { classes: classes.map((c) => c.className), breakpoints: runtimeBreakpoints() }
        : undefined,
    );
    if (token === runToken) {
      status(msg('m55e6f907db2b'));
      el('timing').textContent = `${((performance.now() - started) / 1000).toFixed(2)} s`;
    }
  } catch (e) {
    if (token === runToken) {
      output(`${e instanceof Error ? e.message : String(e)}\n`, 'stderr');
      status(msg('meefc3b522be5'), 'error');
    }
  } finally {
    for (const d of debugDisposals) d.dispose();
    owned?.stop();
    if (token === runToken) {
      if (debugging) debugState({ status: 'finished', snapshot: undefined, previous: undefined });
      runner = undefined;
      running = false;
      updateActions();
    }
  }
}
el('run').onclick = () => void run();
const editorCommands = installEditorCommands(editor, () => void run());
const windowCommands = installWindowCommands({
  save: () => void saveProject(),
  open: filePicker.open,
});
window.addEventListener('beforeunload', (e) => {
  if (dirty || storageBusy || jar?.dirty || jarBusy) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('pagehide', () => {
  disposed = true;
  unsubscribeDebug();
  breakpoints.dispose();
  debugPanel.dispose();
  debugKeys.dispose();
  editorCommands.dispose();
  windowCommands.dispose();
  searchEverywhere.dispose();
  document.removeEventListener('visibilitychange', visibilityChanged);
  filePicker.dispose();
  unsubscribeTheme();
  unsubscribeGraph();
  graphPanel.dispose();
  for (const resource of groupResources) resource.dispose();
  for (const view of groupEditors.values()) if (view !== editor) view.dispose();
  instructionClicks.dispose();
  instructionPanel.dispose();
  panelDock?.dispose();
  stackHover.dispose();
  definitionUI.dispose();
  navigation.dispose();
  detached.dispose();
  previewEpoch++;
  for (const p of classPreviews.values()) p.model.dispose();
  overlayThemeObserver.disconnect();
  editorOverlays.remove();
  sourceAnalysis.dispose();
  clearInterval(folderWatch);
  clearTimeout(analysisTimer);
  compilationService.dispose();
  runner?.stop();
  editor.dispose();
  for (const model of models.values()) model.dispose();
});
void installProject(project).then(() => {
  ensureExample('example/HelloWorld.jal');
  selectClassPreview('example:example/HelloWorld.jal');
});

installFeatureGuides();
