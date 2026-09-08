import './fonts.css';
// Register Monaco contributions before any language provider initializes its services.
// Both windows must load the same feature set, regardless of application import order.
export * from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands';
import 'monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/inlayHints/browser/inlayHintsContribution';
import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
(self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };

// A downloaded font changes glyph metrics after Monaco has first laid out the editor.
import { editor as editorApi } from 'monaco-editor/esm/vs/editor/editor.api';
document.fonts.addEventListener('loadingdone', () => editorApi.remeasureFonts());
