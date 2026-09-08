declare module 'monaco-editor/esm/vs/base/browser/markdownRenderer' {
  export function renderMarkdown(markdown: {
    value: string;
    isTrusted?: boolean;
    supportHtml?: boolean;
  }): { element: HTMLElement; dispose(): void };
}
