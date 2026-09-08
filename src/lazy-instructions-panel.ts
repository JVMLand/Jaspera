import { observePanelVisibility } from './panel-visibility';
import type { Compilation } from './protocol';
import type { installInstructionsPanel as install } from './instructions-panel';
/** Keep dictionary prose and examples off the editor's initial import path. */
export function installInstructionsPanel(
  host: HTMLElement,
  analyze: (source: string) => Promise<Compilation>,
) {
  let panel: ReturnType<typeof install> | undefined,
    loading = false,
    disposed = false,
    selected = 'iadd';
  const visibility = observePanelVisibility(host, (visible) => {
    if (!visible || panel || loading || disposed) return;
    loading = true;
    host.textContent = '命令辞書を読み込んでいます…';
    void import('./instructions-panel')
      .then((module) => {
        if (disposed) return;
        host.replaceChildren();
        panel = module.installInstructionsPanel(host, analyze);
        panel.showInstruction(selected);
      })
      .catch(() => {
        if (!disposed)
          host.textContent =
            '命令辞書を読み込めませんでした。回線を確認してタブを開き直してください。';
      })
      .finally(() => {
        loading = false;
      });
  });
  return {
    showInstruction(op: string) {
      selected = op;
      panel?.showInstruction(op);
    },
    dispose() {
      disposed = true;
      visibility.dispose();
      panel?.dispose();
    },
  };
}
