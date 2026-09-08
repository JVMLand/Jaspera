import { msg } from './messages.js';
import type { DebugCommand, DebugBreakpoint, DebugOptions, DebugSnapshot } from './debug-protocol';
import { expose, transfer } from 'comlink';
import { WorkerRpc, scopedEndpoint } from './worker-rpc';
import type { RuntimeApi } from './runtime.worker';
import type {
  Compilation,
  Disassembly,
  RuntimeRequest,
  RuntimeEvents,
  AnalysisProgress,
  CompileOptions,
} from './protocol';
export class Runtime {
  private rpc = new WorkerRpc<RuntimeApi>(
    () => new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' }),
  );
  private active?: object;
  constructor(private heapMiB = 128) {}
  onDebugReady: () => void | Promise<void> = () => {};
  onDebug: (snapshot: DebugSnapshot) => void = () => {};
  onProgress: (loaded: number, total: number) => void = () => {};
  onOutput: (stream: 'stdout' | 'stderr', text: string) => void = () => {};
  private async request(
    request: RuntimeRequest,
    timeout: number,
    onProgress?: (progress: AnalysisProgress) => void,
  ) {
    if (this.active) throw new Error(msg('mfd40741e352a'));
    const token = {};
    this.active = token;
    const channel = new MessageChannel(),
      scope = scopedEndpoint(channel.port1);
    const events: RuntimeEvents = {
      debugReady: () => {
        if (this.active === token) return this.onDebugReady();
      },
      debug: (snapshot) => {
        if (this.active === token) this.onDebug(snapshot);
      },
      analysis: (progress) => {
        if (this.active === token) onProgress?.(progress);
      },
      progress: (loaded, total) => {
        if (this.active === token) {
          this.onProgress(loaded, total);
          onProgress?.({ phase: 'loading', completed: loaded, total });
        }
      },
      output: (stream, text) => {
        if (this.active === token) this.onOutput(stream, text);
      },
    };
    expose(events, scope.endpoint);
    try {
      return await this.rpc.call<Compilation | Disassembly | void>(
        (api) => api.execute(request, transfer(channel.port2, [channel.port2]), this.heapMiB),
        timeout,
      );
    } catch (error) {
      if (this.active === token) this.rpc.stop();
      throw error;
    } finally {
      scope.dispose();
      channel.port2.close();
      if (this.active === token) this.active = undefined;
    }
  }
  compile(
    source: string,
    onProgress?: (progress: AnalysisProgress) => void,
    options: CompileOptions = { stackFrames: true, graphs: true },
  ) {
    return this.request(
      { type: 'compile', source, options },
      Math.min(300_000, 60_000 + source.length),
      onProgress,
    ) as Promise<Compilation>;
  }
  disassemble(bytecode: string) {
    return this.request({ type: 'disassemble', bytecode }, 30_000) as Promise<Disassembly>;
  }
  run(compilation: Compilation, stdin: string, debug?: DebugOptions) {
    return this.request({ type: 'run', compilation, stdin, debug }, debug ? 0 : 30_000);
  }
  debugCommand(command: DebugCommand) {
    return this.rpc.call((api) => api.debugCommand(command));
  }
  debugBreakpoints(points: DebugBreakpoint[]) {
    return this.rpc.call((api) => api.debugBreakpoints(points));
  }
  stop(message = msg('me00bbb6d81ec')) {
    this.active = undefined;
    this.rpc.stop(message);
  }
}
