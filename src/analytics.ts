// Count visits to the main application only, excluding local previews and detached editors.
if (import.meta.env.PROD && window.location.hostname === 'jaspera.yamad.jp') {
  const measurementId = 'G-2SXGWK2ZNV';
  const analyticsWindow = window as typeof window & { dataLayer?: unknown[] };
  const dataLayer = (analyticsWindow.dataLayer ??= []);
  function gtag(..._args: unknown[]) {
    dataLayer.push(arguments);
  }
  gtag('js', new Date());
  gtag('config', measurementId, {
    page_title: 'Jaspera',
    page_location: window.location.origin + window.location.pathname,
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
}
