import { textSize } from './text-size';

/** Scale tool content against its viewport, never against its scrollable contents. */
export function installPresentationPanelSizing() {
  const panels = [...document.querySelectorAll<HTMLElement>('.dock-content, .detached-tools')];
  const previous = panels.map((panel) => ({
    panel,
    scale: panel.style.getPropertyValue('--ui-font-scale'),
    font: panel.style.fontSize,
  }));
  let frame = 0;
  function update() {
    frame = 0;
    for (const panel of panels) {
      const { width, height } = panel.getBoundingClientRect();
      if (!width || !height) continue;
      const ratio = Math.min(width / 480, Math.sqrt((width * height) / (480 * 720)));
      const pixels = Math.round(Math.max(12, Math.min(32, textSize().ui * ratio)));
      panel.style.setProperty('--ui-font-scale', String(pixels / 14));
      panel.style.fontSize = 'calc(14px * var(--ui-font-scale))';
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  const observer = new ResizeObserver(schedule);
  for (const panel of panels) observer.observe(panel);
  window.addEventListener('jaspera:text-size', schedule);
  schedule();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    window.removeEventListener('jaspera:text-size', schedule);
    for (const { panel, scale, font } of previous) {
      if (scale) panel.style.setProperty('--ui-font-scale', scale);
      else panel.style.removeProperty('--ui-font-scale');
      panel.style.fontSize = font;
    }
  };
}
