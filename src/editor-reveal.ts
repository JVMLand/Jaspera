import { editor as monacoEditor, type editor, type IPosition } from './editor-platform';
export type RevealMode = 'center' | 'ifOutside';
export function revealEditorPosition(
  view: editor.IStandaloneCodeEditor,
  position: IPosition,
  mode: RevealMode = 'center',
) {
  view.setPosition(position);
  if (mode === 'ifOutside') {
    const visible = view
      .getVisibleRanges()
      .some(
        (range) =>
          range.startLineNumber <= position.lineNumber &&
          position.lineNumber <= range.endLineNumber,
      );
    if (!visible) view.revealPositionInCenter(position, monacoEditor.ScrollType.Immediate);
  } else view.revealPositionInCenter(position);
}
