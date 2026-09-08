import type { DebugState } from './debug-protocol';
import type { GraphDocument } from './protocol';
export interface ToolState {
  output: { text: string; stream: string }[];
  stdin: string;
  problems: { label: string; severity: string }[];
}
export interface WorkspaceState {
  debug?: DebugState;
  graphDocument?: GraphDocument;
  tools: ToolState;
  runAvailability?: Record<string, string>;
  canSave: boolean;
  canExportJar?: boolean;
  running: boolean;
  status: string;
  theme: string;
  files: { key: string; title: string }[];
}

/** Presentation data is written by commands, never reconstructed from the DOM.
 * Notifications are coalesced so observers see a completed synchronous change.
 */
export class WorkspaceStateStore {
  private listeners = new Set<() => void>();
  private pending = false;
  private state: WorkspaceState = {
    tools: { output: [], stdin: '', problems: [] },
    canSave: false,
    running: false,
    status: '',
    theme: 'jal-night',
    files: [],
  };
  get value() {
    return this.state;
  }
  update(patch: Partial<WorkspaceState>) {
    if (
      Object.entries(patch).every(
        ([key, value]) => this.state[key as keyof WorkspaceState] === value,
      )
    )
      return;
    this.state = { ...this.state, ...patch };
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      for (const listener of this.listeners) listener();
    });
  }
  updateTools(patch: Partial<ToolState>) {
    this.update({ tools: { ...this.state.tools, ...patch } });
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
