import { codeFontFamily } from './fonts';
import { msg } from './messages.js';
import * as monaco from './editor-platform';
import { installStackHover } from './stack-hover';
import { instructionUsage } from './instruction-usage';
import type { Compilation } from './protocol';
export function installInstructionUsage(
  host: HTMLElement,
  op: string,
  analyze: (source: string) => Promise<Compilation>,
) {
  const { source } = instructionUsage(op);
  const model = monaco.editor.createModel(
    source,
    'jal',
    monaco.Uri.parse('instruction-example:///' + op + '/' + crypto.randomUUID() + '.jal'),
  );
  const editor = monaco.editor.create(host, {
    model,
    readOnly: true,
    domReadOnly: true,
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: codeFontFamily,
    fontSize: 13,
    lineHeight: 21,
    scrollBeyondLastLine: false,
    folding: false,
    lineNumbers: 'off',
    glyphMargin: false,
    overviewRulerLanes: 0,
    renderLineHighlight: 'none',
    wordWrap: 'on',
    padding: { top: 10, bottom: 10 },
    contextmenu: false,
    stickyScroll: { enabled: false },
    hover: { enabled: false },
    ariaLabel: op + msg('m4b7a7c1dbb38'),
  });
  const height = () => {
    host.style.height = Math.min(480, Math.max(140, editor.getContentHeight())) + 'px';
  };
  height();
  const resize = editor.onDidContentSizeChange(height);
  const hover = installStackHover(editor, () => analyze(source));
  return {
    dispose() {
      hover.dispose();
      resize.dispose();
      editor.dispose();
      model.dispose();
    },
  };
}
