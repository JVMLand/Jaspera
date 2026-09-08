import { msg } from './messages.js';
export function installGroupResize(workspace: HTMLElement, onLayout: () => void) {
  let weights = [0.17, 0.48, 0.35];
  try {
    const stored = JSON.parse(localStorage.getItem('jalweb.group-sizes') ?? 'null');
    if (
      Array.isArray(stored) &&
      stored.length === 3 &&
      stored.every((n) => typeof n === 'number' && n > 0 && Number.isFinite(n))
    ) {
      const sum = stored.reduce((a, b) => a + b, 0);
      weights = stored.map((n) => n / sum);
    }
  } catch {}
  const controller = new AbortController(),
    options = { signal: controller.signal };
  const handles: HTMLElement[] = [];
  const vertical = () => matchMedia('(max-width:800px)').matches;
  function apply() {
    weights.forEach((n, i) => workspace.style.setProperty('--group-' + i, n + 'fr'));
    handles.forEach((h, i) => {
      h.setAttribute('aria-orientation', vertical() ? 'horizontal' : 'vertical');
      h.setAttribute('aria-valuenow', String(Math.round(weights[i] * 100)));
    });
    onLayout();
  }
  for (let i = 0; i < 2; i++) {
    const handle = document.createElement('div');
    handle.className = 'group-separator separator-' + i;
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', i === 0 ? msg('m9b22a06cc611') : msg('mbb3b8f4fac01'));
    handle.setAttribute('aria-valuemin', '5');
    handle.setAttribute('aria-valuemax', '90');
    workspace.append(handle);
    handles.push(handle);
    const adjust = (start: number, delta: number) => {
      const sum = weights[i] + weights[i + 1],
        box = workspace.getBoundingClientRect(),
        size = vertical() ? box.height : box.width,
        min = Math.min(0.12, 70 / size);
      weights[i] = Math.max(min, Math.min(sum - min, start + delta / size));
      weights[i + 1] = sum - weights[i];
      apply();
    };
    handle.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        const start = weights[i],
          at = vertical() ? e.clientY : e.clientX;
        const drag = new AbortController();
        handle.addEventListener(
          'pointermove',
          (ev) => adjust(start, (vertical() ? ev.clientY : ev.clientX) - at),
          { signal: drag.signal },
        );
        const end = () => {
          drag.abort();
          try {
            localStorage.setItem('jalweb.group-sizes', JSON.stringify(weights));
          } catch {}
        };
        handle.addEventListener('pointerup', end, { signal: drag.signal });
        handle.addEventListener('lostpointercapture', end, { signal: drag.signal });
        handle.addEventListener('pointercancel', end, { signal: drag.signal });
      },
      options,
    );
    handle.addEventListener(
      'keydown',
      (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        adjust(weights[i], ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -24 : 24);
        try {
          localStorage.setItem('jalweb.group-sizes', JSON.stringify(weights));
        } catch {}
      },
      options,
    );
  }
  const observer = new ResizeObserver(apply);
  observer.observe(workspace);
  apply();
  return {
    snapshot: () => [...weights],
    restore(sizes: number[]) {
      weights = [...sizes];
      apply();
    },
    dispose() {
      controller.abort();
      observer.disconnect();
      handles.forEach((h) => h.remove());
    },
  };
}
