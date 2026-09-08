import type { editor } from 'monaco-editor/esm/vs/editor/editor.api';
export const inlayHintOptions: editor.IEditorInlayHintsOptions = {
  enabled: 'on',
  padding: true,
  fontFamily: '"Segoe UI", "Noto Sans JP", sans-serif',
};
export const inlayHintColors = (foreground: string) => ({
  'editorInlayHint.parameterForeground': foreground,
  'editorInlayHint.parameterBackground': foreground + '18',
});
