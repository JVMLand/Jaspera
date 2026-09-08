import { showDebugGutter } from './source-analysis';
import * as monaco from './editor-platform';
import type { DebugState } from './debug-protocol';
export function installDebugEditor(
  editor: monaco.editor.IStandaloneCodeEditor,
  state: () => DebugState | undefined,
  toggle: (uri: string, line: number) => void,
  uriForClass: (name: string) => string | undefined,
) {
  const decorations = editor.createDecorationsCollection();
  const update = () => {
    const model = editor.getModel();
    if (!model) return;
    const current = state(),
      uri = model.uri.toString();
    const points = new Set(
      (current?.breakpoints ?? []).filter((b) => b.uri === uri).map((b) => b.line),
    );
    const items: monaco.editor.IModelDeltaDecoration[] = [];
    const f = current?.status === 'paused' ? current.snapshot?.frames[0] : undefined;
    const location = current?.status === 'paused' ? current.instructionLocation : undefined;
    const line = location
      ? location.uri === uri
        ? location.line
        : undefined
      : f && f.line > 0 && uriForClass(f.className) === uri
        ? f.line
        : undefined;
    if (line)
      items.push({
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: 'debug-current-line' },
      });
    showDebugGutter(editor, points, line);
    decorations.set(items);
  };
  editor.updateOptions({ glyphMargin: false });
  let root = editor.getDomNode();
  const click = (event: MouseEvent) => {
    const model = editor.getModel();
    if (event.button !== 0 || !model) return;
    // Monaco's gutter overlays can be the event target instead of the rendered span.
    const slot = [...(root?.querySelectorAll<HTMLElement>('.jal-breakpoint-slot') ?? [])].find(
      (node) => {
        const r = node.getBoundingClientRect();
        return (
          event.clientX >= r.left &&
          event.clientX < r.right &&
          event.clientY >= r.top &&
          event.clientY < r.bottom
        );
      },
    );
    if (!slot) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle(model.uri.toString(), Number(slot.dataset.line));
  };
  root?.addEventListener('mousedown', click, true);
  const model = editor.onDidChangeModel(() => {
    root?.removeEventListener('mousedown', click, true);
    root = editor.getDomNode();
    root?.addEventListener('mousedown', click, true);
    update();
  });
  const action = editor.addAction({
    id: 'jaspera.toggleBreakpoint',
    label: 'ブレークポイントを切り替える',
    keybindings: [monaco.KeyCode.F9],
    contextMenuGroupId: 'debug',
    run: (e) => {
      const m = e.getModel(),
        p = e.getPosition();
      if (m && p) toggle(m.uri.toString(), p.lineNumber);
    },
  });
  return {
    update,
    dispose() {
      root?.removeEventListener('mousedown', click, true);
      model.dispose();
      action.dispose();
      decorations.clear();
    },
  };
}
