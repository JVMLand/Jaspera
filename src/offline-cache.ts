export interface OfflineManifest {
  bytes: number;
  cacheId: string;
  entries: { url: string; revision: string | null }[];
}
/** Check every revision in this build, including entries reused from the preceding build. */
export async function offlineComplete(storage: CacheStorage, base: URL, manifest: OfflineManifest) {
  if (!manifest.entries?.length || !/^jaspera(?:-[a-f0-9]{16})?$/.test(manifest.cacheId))
    return false;
  const names = (await storage.keys()).filter((name) =>
    name.startsWith(manifest.cacheId + '-precache-'),
  );
  for (const name of names) {
    const cache = await storage.open(name);
    let complete = true;
    for (const entry of manifest.entries) {
      const url = new URL(entry.url, base);
      if (entry.revision) url.searchParams.set('__WB_REVISION__', entry.revision);
      if (!(await cache.match(url.href))) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }
  return false;
}
/** Stops waiting on network/browser APIs even when the underlying API cannot be cancelled. */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export function waitForWorker(worker: ServiceWorker, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener('statechange', check);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const check = () => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        cleanup();
        resolve();
      } else if (worker.state === 'redundant') {
        cleanup();
        reject(new Error('Worker installation failed'));
      }
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    worker.addEventListener('statechange', check);
    check();
  });
}
