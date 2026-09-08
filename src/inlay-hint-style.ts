import { uiFontFamily } from './fonts';
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api';
export const inlayHintOptions: editor.IEditorInlayHintsOptions = {
  enabled: 'on',
  padding: true,
  fontFamily: uiFontFamily,
};
export const inlayHintColors = (foreground: string) => ({
  'editorInlayHint.parameterForeground': foreground,
  'editorInlayHint.parameterBackground': foreground + '18',
});
