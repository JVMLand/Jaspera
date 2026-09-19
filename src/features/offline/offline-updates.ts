import { type OfflineManifest } from '../../offline-cache';
import { msg } from '../../messages.ts';

const checkInterval = 30 * 60 * 1000;
const focusInterval = 5 * 60 * 1000;
let initialized = false;

/** Only saved installations check for updates. The active worker serves the local manifest. */
export function initializeOfflineUpdates() {
  if (initialized || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  initialized = true;
  const base = new URL(import.meta.env.BASE_URL, location.href);
  const shown = new Set<string>();
  let checking = false,
    recheck = false,
    lastCheck = 0,
    pending: OfflineManifest | undefined;
  const observer = new MutationObserver(() => showPending());
  function showPending() {
    if (!pending || document.visibilityState === 'hidden' || document.querySelector('dialog[open]'))
      return;
    const release = pending;
    pending = undefined;
    observer.disconnect();
    shown.add(release.buildId!);
    const dialog = document.createElement('dialog');
    dialog.id = 'offline-update';
    dialog.setAttribute('aria-labelledby', 'offline-update-title');
    dialog.setAttribute('aria-describedby', 'offline-update-description');
    const title = document.createElement('h2');
    title.id = 'offline-update-title';
    title.textContent = msg('offline.updateTitle');
    const description = document.createElement('p');
    description.id = 'offline-update-description';
    description.textContent = msg('offline.updateDescription');
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const save = document.createElement('button'),
      later = document.createElement('button');
    save.className = 'offline-update-save';
    save.textContent = msg('offline.updateSave');
    later.textContent = msg('offline.updateLater');
    later.onclick = () => dialog.close();
    save.onclick = async () => {
      // Load before closing so a failed import leaves a usable retry button.
      save.disabled = true;
      try {
        const { openOfflinePreparation } = await import('./offline');
        dialog.close();
        await openOfflinePreparation(true);
      } catch {
        save.disabled = false;
      }
    };
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    actions.append(save, later);
    dialog.append(title, description, actions);
    document.body.append(dialog);
    dialog.showModal();
    save.focus();
  }
  async function check(force = false) {
    if (!navigator.onLine || document.visibilityState === 'hidden') return;
    if (checking) {
      recheck ||= force;
      return;
    }
    const controller = navigator.serviceWorker.controller;
    if (!controller || new URL(controller.scriptURL).pathname !== new URL('sw.js', base).pathname)
      return;
    if (!force && Date.now() - lastCheck < focusInterval) return;
    checking = true;
    lastCheck = Date.now();
    try {
      const signal = AbortSignal.timeout(15_000);
      const [localResponse, remoteResponse] = await Promise.all([
        fetch(new URL('offline-manifest.json', base), { signal }),
        fetch(new URL('offline-update.json', base), { cache: 'no-store', signal }),
      ]);
      if (!localResponse.ok || !remoteResponse.ok) return;
      const local: OfflineManifest = await localResponse.json();
      const remote: OfflineManifest = await remoteResponse.json();
      if (navigator.serviceWorker.controller !== controller) return;
      if (
        !local.buildId ||
        !remote.buildId ||
        !/^[a-f0-9]{64}$/.test(remote.buildId) ||
        !remote.entries?.length ||
        local.buildId === remote.buildId ||
        shown.has(remote.buildId)
      )
        return;
      pending = remote;
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['open'],
      });
      showPending();
    } catch {
      // Offline, captive portals and failed deployments must not interrupt editing.
    } finally {
      checking = false;
      if (recheck) {
        recheck = false;
        void check(true);
      }
    }
  }
  window.addEventListener('online', () => void check(true));
  window.addEventListener('focus', () => void check());
  document.addEventListener('visibilitychange', () => {
    showPending();
    void check();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => void check(true));
  window.setInterval(() => void check(), checkInterval);
  void check();
}
