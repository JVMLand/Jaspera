import { RuntimeDebugger } from './runtime-debugger';
import type { DebugCommand, DebugBreakpoint } from './debug-protocol';
/// <reference lib="webworker" />
import { expose, wrap, type Remote } from 'comlink';
import { scopedEndpoint } from './worker-rpc';
import type { Compilation, Disassembly, RuntimeRequest, RuntimeEvents } from './protocol';
let events: Remote<RuntimeEvents> | undefined;
let notifications = Promise.resolve();
function notify(action: (sink: Remote<RuntimeEvents>) => Promise<void>) {
  const sink = events;
  if (sink) notifications = notifications.then(() => action(sink)).catch(() => {});
}
const root = new URL('../runtime/', self.location.href).href;
let os: any;
let vm: any;
let bridge: any;
let initialization: Promise<void> | undefined;
const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
let outputBytes = 0;
let buffers = { stdout: '', stderr: '' };
let flushTimer: ReturnType<typeof setTimeout> | undefined;
function flush() {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  for (const stream of ['stdout', 'stderr'] as const) {
    const text = buffers[stream];
    if (text) notify((sink) => sink.output(stream, text));
    buffers[stream] = '';
  }
}
function outputText(stream: 'stdout' | 'stderr', bytes: Uint8Array) {
  const remaining = 256 * 1024 - outputBytes;
  if (remaining <= 0) return;
  const accepted = bytes.subarray(0, remaining);
  outputBytes += accepted.length;
  buffers[stream] += decoders[stream].decode(accepted, { stream: true });
  if (outputBytes >= 256 * 1024) buffers.stderr += '\n[出力は 256 KiB で打ち切られました]\n';
  flushTimer ??= setTimeout(flush, 32);
}
let compiling = false,
  progressText = '';
const progressDecoder = new TextDecoder();
function output(stream: 'stdout' | 'stderr', bytes: Uint8Array) {
  if (!compiling || stream !== 'stdout') {
    outputText(stream, bytes);
    return;
  }
  progressText += progressDecoder.decode(bytes, { stream: true });
  let end: number;
  while ((end = progressText.indexOf('\n')) >= 0) {
    const line = progressText.slice(0, end);
    progressText = progressText.slice(end + 1);
    if (line.startsWith('\x1eJALWEB_PROGRESS ')) {
      try {
        const progress = JSON.parse(line.slice(17));
        notify((sink) => sink.analysis(progress));
      } catch {}
    } else outputText(stream, new TextEncoder().encode(line + '\n'));
  }
}
async function initialize(heapMiB: number) {
  if (!Number.isInteger(heapMiB) || heapMiB < 16 || heapMiB > 128)
    throw new Error('JVM ヒープ容量が不正です。');
  if (initialization) return initialization;
  initialization = (async () => {
    const moduleUrl = new URL('bovine.js', root).href;
    const { makeBovineOS } = await import(/* @vite-ignore */ moduleUrl);
    os = await makeBovineOS({
      runtimeUrl: root.replace(/\/$/, ''),
      wasmLocation: new URL('bjvm_main.wasm', root).href,
      additionalRuntimeFiles: [
        'jalweb-compiler.jar',
        'jdk23/lib/tzdb.dat',
        'jdk23/conf/logging.properties',
      ],
      fetchParams: { cache: 'default' },
      progress: (loaded: number, total: number) => notify((sink) => sink.progress(loaded, total)),
      stdout: (bytes: Uint8Array) => output('stdout', bytes),
      stderr: (bytes: Uint8Array) => output('stderr', bytes),
    });
    vm = os.makeVM({ classpath: 'jalweb-compiler.jar', heapSize: heapMiB * 1024 * 1024 });
    vm.setPreemptionFrequencyUs(5000);
    bridge = vm.loadClass('jalweb/Bridge');
  })();
  return initialization;
}
function encodeText(text: string) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 1024 * 1024) throw new Error('入力は 1 MiB 以下にしてください。');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
let debuggerSession: RuntimeDebugger | undefined;
function endDebug() {
  if (debuggerSession) {
    vm._module._jaspera_debug_disable(vm.getActiveThread().ptr);
    debuggerSession = undefined;
    vm._module.jasperaDebugger = undefined;
  }
}
let busy = false;
const api = {
  debugCommand(command: DebugCommand) {
    if (!debuggerSession) throw new Error('デバッグ実行中ではありません。');
    debuggerSession.command(command);
  },
  debugBreakpoints(points: DebugBreakpoint[]) {
    debuggerSession?.breakpoints(points);
  },
  async execute(
    data: RuntimeRequest,
    port: MessagePort,
    heapMiB = 128,
  ): Promise<Compilation | Disassembly | void> {
    if (busy) {
      port.close();
      throw new Error('JVM は処理中です。');
    }
    busy = true;
    outputBytes = 0;
    buffers = { stdout: '', stderr: '' };
    for (const decoder of Object.values(decoders)) decoder.decode();
    progressDecoder.decode();
    const scope = scopedEndpoint(port);
    events = wrap<RuntimeEvents>(scope.endpoint);
    notifications = Promise.resolve();
    try {
      await initialize(heapMiB);
      if (data.type === 'compile') {
        compiling = true;
        progressText = '';
        const compilation = JSON.parse(
          await bridge.compileSelected(
            encodeText(data.source),
            (data.options?.stackFrames ? 1 : 0) | (data.options?.graphs ? 2 : 0),
          ),
        );
        return compilation;
      } else if (data.type === 'disassemble') {
        if (data.bytecode.length > 1400000) throw new Error('class は 1 MiB 以下にしてください。');
        return JSON.parse(await bridge.disassemble(data.bytecode));
      } else {
        const { className, bytecode } = data.compilation;
        if (!/^[\w$/]+$/.test(className) || className.includes('..') || !bytecode)
          throw new Error('実行するクラスがありません。');
        const classes = data.compilation.classes ?? [{ className, bytecode }];
        const names = new Set<string>();
        if (!classes.length || classes.length > 64)
          throw new Error('実行するクラスの数が不正です。');
        for (const item of classes) {
          if (
            !/^[\w$]+(?:\/[\w$]+)*$/.test(item.className) ||
            !item.bytecode ||
            names.has(item.className)
          )
            throw new Error('実行するクラスが不正または重複しています。');
          names.add(item.className);
        }
        if (!names.has(className)) throw new Error('実行対象が見つかりません。');
        const manifest = classes.map((c) => c.className + '\t' + c.bytecode).join('\n');
        if (manifest.length > 16 * 1024 * 1024) throw new Error('コンパイル結果が大きすぎます。');
        if (data.debug) {
          debuggerSession = new RuntimeDebugger(vm, data.debug, (snapshot) => {
            flush();
            notify((sink) => sink.debug(snapshot));
          });
          notify((sink) => sink.debugReady());
          await notifications;
        }
        await bridge.runProject(className, manifest, encodeText(data.stdin));
        for (const stream of ['stdout', 'stderr'] as const)
          buffers[stream] += decoders[stream].decode();
        flush();
      }
    } catch (error: any) {
      endDebug();
      let message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : error?.constructor?.name || 'JVM error';
      try {
        if (error?.getMessage) message = `${error.constructor.name}: ${await error.getMessage()}`;
        if (error?.printStackTrace) await error.printStackTrace();
      } catch {}
      throw new Error(message);
    } finally {
      endDebug();
      if (compiling) {
        progressText += progressDecoder.decode();
        if (progressText) outputText('stdout', new TextEncoder().encode(progressText));
        progressText = '';
        compiling = false;
      }
      flush();
      await notifications;
      events = undefined;
      scope.dispose();
      busy = false;
    }
  },
};
export type RuntimeApi = typeof api;
expose(api);
