import { msg } from './messages.js';
import type {
  DebugBreakpoint,
  DebugCommand,
  DebugLocation,
  DebugOptions,
  DebugSnapshot,
  DebugFrame,
} from './debug-protocol';
/** This controller runs in the JVM worker. It never evaluates Java code. */
export class RuntimeDebugger {
  paused = false;
  frames: DebugFrame[] = [];
  private mode: DebugCommand | 'entry' = 'continue';
  private location?: DebugLocation;
  private skips = new Map<number, DebugLocation>();
  private reason: DebugSnapshot['reason'] = 'entry';
  private points = new Set<string>();
  private rootDepths = new Map<number, number>();
  private classes: Set<string>;
  private calls = new Map<number, DebugFrame[]>();
  canCaptureCall(thread: number, depth: number) {
    return depth >= (this.rootDepths.get(thread) ?? Infinity);
  }
  captureCall(thread: number, depth: number, frame: DebugFrame) {
    let calls = this.calls.get(thread);
    if (!calls) {
      calls = [];
      this.calls.set(thread, calls);
    }
    calls[depth] = frame;
  }

  constructor(
    private vm: any,
    options: DebugOptions,
    private publishSnapshot: (snapshot: DebugSnapshot) => void,
  ) {
    this.mode = options.stopOnEntry ? 'entry' : 'continue';
    this.classes = new Set(options.classes);
    this.breakpoints(options.breakpoints);
    const module = vm._module;
    if (!module._jaspera_debug_enable) throw new Error(msg('m2a0c66fdee72'));
    module.jasperaDebugger = this;
    module._jaspera_debug_enable(vm.getActiveThread().ptr);
  }
  breakpoints(points: DebugBreakpoint[]) {
    this.points = new Set(points.map((p) => p.className + ':' + p.line));
  }
  check = (where: DebugLocation) => {
    // Only live callers are retained; returns and exception unwinding release them.
    const calls = this.calls.get(where.thread);
    if (calls && calls.length > where.depth) calls.length = where.depth;
    // Internal resolution may redispatch an opcode. Only an executed instruction
    // (including a self-loop) or a different frame can finish a step.
    const skip = this.skips.get(where.thread);
    if (skip) {
      if (skip.frame === where.frame && skip.pc === where.pc && skip.sequence === where.sequence)
        return false;
      this.skips.delete(where.thread);
    }
    const user = this.classes.has(where.className),
      previous = this.location;
    const rootDepth = Math.min(
      this.rootDepths.get(where.thread) ?? Infinity,
      user ? where.depth : Infinity,
    );
    this.rootDepths.set(where.thread, rootDepth);
    if (where.depth < rootDepth) {
      // A step cannot carry on in a later, unrelated call made by the runtime.
      if (previous?.thread === where.thread && ['into', 'over', 'out'].includes(this.mode))
        this.mode = 'continue';
      return false;
    }
    let reason: DebugSnapshot['reason'] | undefined;
    if (user && this.points.has(where.className + ':' + where.line)) reason = 'breakpoint';
    else if (this.mode === 'entry' && user) reason = 'entry';
    else if (this.mode === 'pause' && user) reason = 'pause';
    else if (previous && where.thread === previous.thread) {
      if (this.mode === 'into') reason = 'step';
      else if (this.mode === 'over' && where.depth <= previous.depth) reason = 'step';
      else if (this.mode === 'out' && where.depth < previous.depth) reason = 'step';
    }
    if (!reason) return false;
    this.location = where;
    this.reason = reason;
    this.frames = [];
    this.paused = true;
    return true;
  };
  publish = () => {
    const location = this.location!,
      calls = this.calls.get(location.thread);
    const frames = this.frames
      .slice(0, location.depth - this.rootDepths.get(location.thread)! + 1)
      .map((frame, index) => {
        const saved = index > 0 ? calls?.[location.depth - index] : undefined;
        return saved &&
          saved.id === frame.id &&
          saved.pc === frame.pc &&
          saved.className === frame.className &&
          saved.method === frame.method &&
          saved.descriptor === frame.descriptor
          ? {
              ...frame,
              stack: saved.stack,
              locals: saved.locals,
              instruction: saved.instruction,
              callSnapshot: true,
            }
          : frame;
      });
    this.publishSnapshot({ location, frames, reason: this.reason });
  };
  command(command: DebugCommand) {
    if (command === 'pause') {
      if (!this.paused) this.mode = 'pause';
      return;
    }
    if (!this.paused) throw new Error(msg('m7b8efde7231b'));
    const rootReturn =
      this.location!.depth === this.rootDepths.get(this.location!.thread) &&
      /^(?:[ilfda]?return)$/.test(this.frames[0]?.instruction?.opcode ?? '');
    // Native/reflection frames may return without another instruction hook at a
    // shallower depth. End stepping explicitly when the user's root frame returns.
    this.mode = rootReturn && ['into', 'over', 'out'].includes(command) ? 'continue' : command;
    this.skips.set(this.location!.thread, this.location!);
    this.paused = false;
    this.vm.scheduleTimeout();
  }
}
