/** Docking, popup tabs and browser visibility share the same lazy-work boundary. */
export function observePanelVisibility(host: HTMLElement, changed: (visible: boolean) => void) {
  let intersecting = false,
    current = false;
  const publish = () => {
    const visible = intersecting && document.visibilityState !== 'hidden';
    if (visible !== current) {
      current = visible;
      changed(visible);
    }
  };
  const observer = new IntersectionObserver((entries) => {
    intersecting = entries.at(-1)?.isIntersecting ?? false;
    publish();
  });
  observer.observe(host);
  document.addEventListener('visibilitychange', publish);
  return {
    dispose() {
      observer.disconnect();
      document.removeEventListener('visibilitychange', publish);
    },
  };
}
