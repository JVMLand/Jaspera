export const lastVersionKey = 'jaspera.lastVersion';
export function compareVersions(a: string, b: string) {
  const parts = (v: string) => (/^\d{4}\.\d+$/.test(v) ? v.split('.').map(Number) : undefined);
  const x = parts(a),
    y = parts(b);
  return x && y ? x[0] - y[0] || x[1] - y[1] : 0;
}
export function initializeChangelog() {
  const current = __APP_VERSION__;
  let previous: string | null;
  try {
    previous = localStorage.getItem(lastVersionKey);
    if (!previous) {
      localStorage.setItem(lastVersionKey, current);
      return;
    }
  } catch {
    return;
  }
  if (compareVersions(current, previous) <= 0) return;
  let opening = false;
  const attempt = () => {
    if (opening || document.visibilityState === 'hidden' || document.querySelector('dialog[open]'))
      return;
    opening = true;
    observer.disconnect();
    document.removeEventListener('visibilitychange', attempt);
    void import('./changelog').then((m) => m.openChangelog(current)).catch(() => {});
  };
  const observer = new MutationObserver(attempt);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  document.addEventListener('visibilitychange', attempt);
  window.addEventListener(
    'pagehide',
    () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', attempt);
    },
    { once: true },
  );
  attempt();
}
