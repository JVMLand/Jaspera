import * as monaco from './editor-platform';
import type { DebugState } from './debug-protocol';
/** Anchors belong to documents, not editor views (including detached views). */
export class BreakpointStore {
  private entries = new Map<
    monaco.editor.ITextModel,
    { ids: string[]; subscriptions: monaco.IDisposable[] }
  >();
  constructor(private changed: (points: DebugState['breakpoints']) => void) {}
  private lines(model: monaco.editor.ITextModel) {
    return [
      ...new Set(
        (this.entries.get(model)?.ids ?? []).flatMap((id) => {
          const r = model.getDecorationRange(id);
          return r ? [r.startLineNumber] : [];
        }),
      ),
    ];
  }
  private publish() {
    this.changed(
      [...this.entries.keys()].flatMap((model) =>
        this.lines(model).map((line) => ({ uri: model.uri.toString(), line })),
      ),
    );
  }
  private set(model: monaco.editor.ITextModel, lines: number[]) {
    let entry = this.entries.get(model);
    if (!entry) {
      entry = { ids: [], subscriptions: [] };
      this.entries.set(model, entry);
      entry.subscriptions.push(
        model.onDidChangeContent(() => this.publish()),
        model.onWillDispose(() => this.remove(model)),
      );
    }
    entry.ids = model.deltaDecorations(
      entry.ids,
      lines.map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          description: 'debug-breakpoint-anchor',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })),
    );
    if (!lines.length) this.remove(model);
    else this.publish();
  }
  private remove(model: monaco.editor.ITextModel) {
    const entry = this.entries.get(model);
    if (!entry) return;
    this.entries.delete(model);
    for (const d of entry.subscriptions) d.dispose();
    if (!model.isDisposed()) model.deltaDecorations(entry.ids, []);
    this.publish();
  }
  toggle(model: monaco.editor.ITextModel, line: number) {
    const lines = this.lines(model);
    line = model.validatePosition({ lineNumber: line, column: 1 }).lineNumber;
    this.set(model, lines.includes(line) ? lines.filter((n) => n !== line) : [...lines, line]);
  }
  move(from: monaco.editor.ITextModel, to: monaco.editor.ITextModel) {
    const lines = this.lines(from);
    if (lines.length) this.set(to, lines);
    this.remove(from);
  }
  dispose() {
    for (const model of [...this.entries.keys()]) this.remove(model);
  }
}
