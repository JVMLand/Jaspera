import { msg } from './messages.js';
import { wrap, type Endpoint, type Remote } from 'comlink';
// Only lifecycle management lives here; Comlink owns RPC dispatch and serialization.
export function scopedEndpoint(target: Worker | MessagePort) {
  const listeners = new Map<EventListenerOrEventListenerObject, string>();
  const endpoint: Endpoint = {
    postMessage: (message, transfer) => target.postMessage(message, transfer ?? []),
    addEventListener(type, listener) {
      listeners.set(listener, type);
      target.addEventListener(type, listener);
    },
    removeEventListener(type, listener) {
      listeners.delete(listener);
      target.removeEventListener(type, listener);
    },
    start: () => {
      if ('start' in target) target.start();
    },
  };
  return {
    endpoint,
    dispose() {
      for (const [listener, type] of listeners) target.removeEventListener(type, listener);
      listeners.clear();
      if ('close' in target) target.close();
    },
  };
}
export class WorkerRpc<T> {
  private worker?: Worker;
  private remote?: Remote<T>;
  private scope?: ReturnType<typeof scopedEndpoint>;
  private closed = false;
  private pending = new Set<(error: Error) => void>();
  constructor(private factory: () => Worker) {}
  call<R>(invoke: (remote: Remote<T>) => Promise<R>, timeout = 60_000): Promise<R> {
    if (this.closed) return Promise.reject(new Error(msg('mca2922eda974')));
    if (!this.worker) {
      this.worker = this.factory();
      this.scope = scopedEndpoint(this.worker);
      this.remote = wrap<T>(this.scope.endpoint);
      this.worker.onerror = (e) => {
        e.preventDefault();
        this.stop(e.message || msg('md1010d6a3752'));
      };
      this.worker.onmessageerror = () => this.stop(msg('m7e45bc5e2da6'));
    }
    return new Promise<R>((resolve, reject) => {
      const finish = (error?: Error, value?: R) => {
        if (!this.pending.delete(cancel)) return;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value as R);
      };
      const cancel = (error: Error) => finish(error);
      const timer =
        timeout > 0 ? setTimeout(() => this.stop(msg('m1c0ec1227c27')), timeout) : undefined;
      this.pending.add(cancel);
      try {
        invoke(this.remote!).then(
          (value) => finish(undefined, value),
          (error) => finish(error instanceof Error ? error : new Error(String(error))),
        );
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  stop(message = msg('me00bbb6d81ec')) {
    this.scope?.dispose();
    this.scope = undefined;
    if (this.worker) {
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
    }
    this.worker = undefined;
    this.remote = undefined;
    for (const cancel of this.pending) cancel(new Error(message));
  }
  dispose() {
    this.closed = true;
    this.stop(msg('mca2922eda974'));
  }
}
