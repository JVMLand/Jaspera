import { msg } from './messages.js';
import { observePanelVisibility } from './panel-visibility';
import type { GraphDocument } from './protocol';
import type { installInstructionGraph as install } from './instruction-graph';

/** Load graph rendering only when its pane is shown, in either window. */
export function installInstructionGraph(...args: Parameters<typeof install>) {
  const [host] = args;
  let panel: ReturnType<typeof install> | undefined;
  let pending: GraphDocument | undefined;
  let loading = false;
  let disposed = false;
  const visibility = observePanelVisibility(host, (visible) => {
    if (!visible || panel || loading || disposed) return;
    loading = true;
    host.textContent = msg('mec79e2e4092c');
    void import('./instruction-graph')
      .then(({ installInstructionGraph }) => {
        if (disposed) return;
        host.replaceChildren();
        panel = installInstructionGraph(...args);
        panel.update(pending);
      })
      .catch(() => {
        if (!disposed) host.textContent = msg('m866670cee859');
      })
      .finally(() => {
        loading = false;
      });
  });
  return {
    update(next?: GraphDocument) {
      pending = next;
      panel?.update(next);
    },
    dispose() {
      disposed = true;
      visibility.dispose();
      panel?.dispose();
    },
  };
}
