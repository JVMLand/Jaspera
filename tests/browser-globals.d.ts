import type { editor } from 'monaco-editor';
import type { installInstructionGraph } from '../src/instruction-graph';
import type { Runtime } from '../src/runtime';

type GraphCompile = Parameters<typeof installInstructionGraph>[1];
type GraphDocument = Parameters<GraphCompile>[0];
type GraphResult = Awaited<ReturnType<GraphCompile>>;

declare global {
  interface Window {
    app: typeof import('../src/main');
    testMain: typeof import('../src/main');
    jarModel: editor.ITextModel;
    runtime: Runtime;
    lastProgress: Parameters<NonNullable<Parameters<GraphCompile>[1]>>[0];
    layoutCalls: number;
    pickerCalls: number;
    calls: number;
    cancelPicker: boolean;
    cancelSave: boolean;
    folderName: string;
    pauseWrites: boolean;
    writePending: boolean;
    resumeWrite: () => void;
    originalSetItem: typeof Storage.prototype.setItem;
    originalOpen: typeof window.open;
    showDirectoryPicker: (options?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
    graphProgressSeen: { outline: boolean; partial: boolean; stepped: boolean };
    graphProgressObserver: MutationObserver;
    panel: ReturnType<typeof installInstructionGraph>;
    progressPanel: ReturnType<typeof installInstructionGraph>;
    doc: GraphDocument;
    freshDoc: GraphDocument;
    jobs: {
      doc: GraphDocument;
      progress: NonNullable<Parameters<GraphCompile>[1]>;
      resolve: (result: GraphResult) => void;
    }[];
    graphFor: (name: string) => GraphResult['graphs'][number];
    visited: number | boolean;
    visitedLine: number;
    line: number;
    __debugStops: number;
  }
  var Tabs: typeof import('../src/tab-interactions');
  var detached: string[];
  var received: string[];
  var transfer: DataTransfer;
  var exit: ReturnType<typeof Tabs.paneWindowExit>;
  interface FileSystemDirectoryHandle {
    keys(): AsyncIterableIterator<string>;
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
  interface Navigator {
    readonly deviceMemory?: number;
  }
}
