import { offlineComplete, abortable, waitForWorker, type OfflineManifest } from './offline-cache';
import { msg } from './messages.js';
let current: HTMLDialogElement | undefined;
export async function openOfflinePreparation() {
  if (current?.open) {
    current.focus();
    return;
  }
  const dialog = document.createElement('dialog');
  current = dialog;
  dialog.setAttribute('aria-labelledby', 'offline-title');
  dialog.innerHTML = msg('m6896f9242261');
  document.body.append(dialog);
  dialog.showModal();
  const status = dialog.querySelector<HTMLElement>('.offline-status')!,
    start = dialog.querySelector<HTMLButtonElement>('.offline-start')!,
    progress = dialog.querySelector<HTMLProgressElement>('progress')!;
  dialog.querySelector<HTMLButtonElement>('.offline-close')!.onclick = () => dialog.close();
  let operation: AbortController | undefined;
  dialog.onclose = () => {
    operation?.abort(new DOMException('Closed', 'AbortError'));
    dialog.remove();
    if (current === dialog) current = undefined;
  };
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !isSecureContext) {
    status.textContent = msg('m5a63b1d199ba');
    return;
  }
  const base = new URL(import.meta.env.BASE_URL, location.href);
  let manifest: OfflineManifest;
  const complete = () => offlineComplete(caches, base, manifest);
  const beginOperation = () => {
    const controller = new AbortController();
    operation = controller;
    const timer = setTimeout(() => controller.abort(new Error(msg('offline.timeout'))), 300_000);
    return {
      signal: controller.signal,
      finish: () => {
        clearTimeout(timer);
        if (operation === controller) operation = undefined;
      },
    };
  };
  const loading = beginOperation();
  try {
    const response = await fetch(new URL('offline-manifest.json', base), {
      signal: loading.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(msg('mcd3df9fc8025'));
    manifest = await response.json();
    status.textContent = msg('me9991f0f3e4e', [(manifest.bytes / 1024 / 1024).toFixed(1)]);
    start.disabled = false;
  } catch (error) {
    loading.finish();
    if (dialog.open) status.textContent = String(error);
    return;
  }
  loading.finish();
  if (!dialog.open) return;
  start.onclick = async () => {
    const task = beginOperation();
    const wait = <T>(promise: Promise<T>) => abortable(promise, task.signal);
    start.disabled = true;
    progress.hidden = false;
    status.textContent = msg('m717dc5434ad9');
    try {
      if (!navigator.onLine) {
        if (await wait(complete())) {
          status.textContent = msg('mda778e9bcabf');
          return;
        }
        throw new Error(msg('m18709964c2b0'));
      }
      const existing = await wait(navigator.serviceWorker.getRegistration(base.href));
      const workerUrl = new URL('sw.js', base);
      // A distinct script URL forces installation even when an active worker lost cache entries.
      if (existing?.active && !(await wait(complete())))
        workerUrl.searchParams.set('repair', String(Date.now()));
      const registration = await wait(
        navigator.serviceWorker.register(workerUrl, {
          scope: base.href,
          updateViaCache: 'none',
        }),
      );
      await wait(registration.update());
      const worker = registration.installing ?? registration.waiting ?? registration.active;
      if (!worker) throw new Error(msg('mf0715fe6e5e6'));
      await waitForWorker(worker, task.signal);
      if (!(await wait(complete()))) throw new Error(msg('mf7225b17cf27'));
      await wait(navigator.storage?.persist?.().catch(() => false) ?? Promise.resolve(false));
      status.textContent = registration.waiting ? msg('m43358fb437f6') : msg('mca566e31aed0');
      start.textContent = msg('mde5b25f8dc84');
    } catch (error) {
      if (dialog.open) status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      task.finish();
      progress.hidden = true;
      start.disabled = false;
    }
  };
}
