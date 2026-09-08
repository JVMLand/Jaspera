import { estimatedSize } from './estimated-size';
import { msg } from './messages.js';
import { BoundedCache, defaultCacheBudget } from './bounded-cache';
import type { Compilation, Disassembly, AnalysisProgress, CompileOptions } from './protocol';

interface Compiler {
  compile(
    source: string,
    onProgress?: (progress: AnalysisProgress) => void,
    options?: CompileOptions,
  ): Promise<Compilation>;
  disassemble(bytecode: string): Promise<Disassembly>;
  stop(): void;
}

/** Workspace-owned compilation queue. All views share in-flight and completed results.
 * Identity is the document object, not its path, so reopening a path cannot reuse
 * another document's result. Source snapshots remain valid while edits continue.
 */
type ProgressListener = (progress: AnalysisProgress) => void;
interface Entry {
  source: string;
  promise: Promise<Compilation>;
  progress: AnalysisProgress;
  partials: AnalysisProgress[];
  listeners: Set<ProgressListener>;
  settled: boolean;
  started: boolean;
  options: CompileOptions;
}
export class CompilationService {
  private cache = new WeakMap<object, Entry>();
  private completed = new BoundedCache<Entry, WeakRef<object>>(
    defaultCacheBudget,
    64,
    (entry, reference) => {
      const document = reference.deref();
      if (document && this.cache.get(document) === entry) this.cache.delete(document);
    },
  );
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private pending = 0;
  private background = false;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private compiler: Compiler,
    private backgroundIdleMs = 60_000,
  ) {}

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    clearTimeout(this.idleTimer);
    this.pending++;
    const promise = this.queue.then(() => {
      if (this.disposed) throw new Error(msg('m430ebe2657fc'));
      return work();
    });
    this.queue = promise
      .then(
        () => {},
        () => {},
      )
      .then(() => {
        this.pending--;
        this.scheduleIdle();
      });
    return promise;
  }
  private scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (!this.disposed && this.background && this.pending === 0)
      this.idleTimer = setTimeout(() => this.compiler.stop(), this.backgroundIdleMs);
  }
  setBackground(background: boolean) {
    this.background = background;
    this.scheduleIdle();
  }
  disassemble(bytecode: string) {
    if (this.disposed) return Promise.reject(new Error(msg('m430ebe2657fc')));
    return this.enqueue(() => this.compiler.disassemble(bytecode));
  }

  compile(
    document: object,
    source: string,
    onProgress?: ProgressListener,
    options: CompileOptions = { stackFrames: true, graphs: true },
  ): Promise<Compilation> {
    if (this.disposed) return Promise.reject(new Error(msg('m430ebe2657fc')));
    const cached = this.cache.get(document);
    if (cached) this.completed.get(cached);
    if (cached?.source === source) {
      const covers =
        (!options.graphs || cached.options.graphs) &&
        (!options.stackFrames || cached.options.stackFrames);
      if (covers || !cached.started) {
        Object.assign(cached.options, {
          graphs: !!(options.graphs || cached.options.graphs),
          stackFrames: !!(options.stackFrames || cached.options.stackFrames),
        });
        this.subscribe(cached, onProgress);
        return cached.promise;
      }
      options = {
        graphs: !!(options.graphs || cached.options.graphs),
        stackFrames: !!(options.stackFrames || cached.options.stackFrames),
      };
    }
    if (cached) this.completed.delete(cached);
    const promise = this.enqueue(() => {
      if (this.cache.get(document) !== entry) {
        const error = new Error(msg('m20f0aa9e3abe'));
        error.name = 'AbortError';
        throw error;
      }
      entry.started = true;
      entry.progress = { phase: 'loading', completed: 0, total: 0 };
      for (const listener of entry.listeners)
        try {
          listener(entry.progress);
        } catch {}
      return this.compiler.compile(
        source,
        (progress) => {
          if (entry.settled) return;
          entry.progress = progress;
          if (progress.graph) entry.partials.push(progress);
          for (const listener of entry.listeners)
            try {
              listener(progress);
            } catch {}
        },
        entry.options,
      );
    });
    const entry: Entry = {
      source,
      promise,
      progress: {
        phase: 'queued',
        completed: 0,
        total: 0,
        waitingFor:
          this.pending > 1
            ? cached?.source === source && cached.started && !cached.settled
              ? msg('m16566deaf6a5')
              : msg('m98d251e2bf9e')
            : msg('mbd71d91cc8f0'),
      },
      partials: [],
      listeners: new Set(),
      settled: false,
      started: false,
      options: { ...options },
    };
    this.cache.set(document, entry);
    this.subscribe(entry, onProgress);
    const finish = () => {
      entry.settled = true;
      entry.listeners.clear();
      entry.partials = [];
      entry.progress = { phase: 'complete', completed: 1, total: 1 };
    };
    void promise.then((result) => {
      finish();
      if (!this.disposed && this.cache.get(document) === entry) {
        const bytes = source.length * 2 + estimatedSize(result, defaultCacheBudget);
        this.completed.set(entry, new WeakRef(document), bytes);
        // Oversized results are returned to the caller but not retained by the service.
        if (bytes > defaultCacheBudget) this.cache.delete(document);
      }
    }, finish);
    void promise.catch(() => {
      // An older failure must not discard a newer revision's pending result.
      if (this.cache.get(document) === entry) this.cache.delete(document);
    });
    return promise;
  }

  private subscribe(entry: Entry, listener?: ProgressListener) {
    if (!listener || entry.settled) return;
    entry.listeners.add(listener);
    try {
      for (const partial of entry.partials) listener(partial);
      listener(entry.progress);
    } catch {}
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    this.cache = new WeakMap();
    this.completed = new BoundedCache(defaultCacheBudget);
    this.compiler.stop();
  }
}
