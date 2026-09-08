// Shared by workspace groups and detached windows.
const MIME = 'application/x-jalweb-tab';
export function paneDrag(node: HTMLElement, workspace: string, key: string) {
  node.draggable = true;
  let dragging = false;
  node.addEventListener(
    'click',
    (e) => {
      if (dragging) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  node.addEventListener('dragend', () => {
    setTimeout(() => (dragging = false), 0);
    node.ownerDocument
      .querySelectorAll('.dock-drop-target')
      .forEach((n) => n.classList.remove('dock-drop-target'));
  });
  node.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer) return;
    dragging = true;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(MIME, JSON.stringify({ workspace, key }));
  });
}
export function paneDrop(
  node: HTMLElement,
  workspace: string,
  open: (key: string, event: DragEvent) => void,
) {
  const controller = new AbortController(),
    options = { signal: controller.signal };
  node.addEventListener(
    'dragover',
    (e) => {
      if (!e.dataTransfer?.types.includes(MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      node.classList.add('dock-drop-target');
    },
    options,
  );
  node.addEventListener(
    'dragleave',
    (e) => {
      if (!node.contains(e.relatedTarget as Node)) node.classList.remove('dock-drop-target');
    },
    options,
  );
  node.addEventListener(
    'drop',
    (e) => {
      node.ownerDocument
        .querySelectorAll('.dock-drop-target')
        .forEach((n) => n.classList.remove('dock-drop-target'));
      const data = e.dataTransfer?.getData(MIME);
      if (!data) return;
      e.preventDefault();
      e.stopPropagation();
      let item: unknown;
      try {
        item = JSON.parse(data);
      } catch {
        return;
      }
      if (
        item &&
        typeof item === 'object' &&
        'workspace' in item &&
        item.workspace === workspace &&
        'key' in item &&
        typeof item.key === 'string'
      ) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        open(item.key, e);
      }
    },
    options,
  );
  return {
    dispose() {
      controller.abort();
      node.classList.remove('dock-drop-target');
    },
  };
}

/** Detach only after release outside this viewport. A successful drop in another
 * window wins even though its coordinates lie outside the source window. */
export function paneWindowExit(workspace: string, detach: (key: string) => void) {
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  let active: string | undefined;
  const reset = () => {
    active = undefined;
  };
  document.addEventListener(
    'dragstart',
    (event) => {
      reset();
      const node = (event.target as Element)?.closest<HTMLElement>('[data-pane-key]');
      if (!node) return;
      try {
        const data = JSON.parse(event.dataTransfer?.getData(MIME) ?? 'null');
        if (data?.workspace === workspace && data.key === node.dataset.paneKey) active = data.key;
      } catch {}
    },
    { signal: controller.signal },
  );
  document.addEventListener(
    'dragend',
    (event) => {
      const key = active;
      reset();
      if (!key || (event.dataTransfer && event.dataTransfer.dropEffect !== 'none')) return;
      // Use the release coordinates, not the last dragleave. (0, 0), also reported
      // for cancelled native drags, is inside and must not create a window.
      const outside =
        event.clientX < 0 ||
        event.clientY < 0 ||
        event.clientX >= innerWidth ||
        event.clientY >= innerHeight;
      if (outside) detach(key);
    },
    options,
  );
  document.addEventListener('drop', reset, options);
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') reset();
    },
    options,
  );
  window.addEventListener('pagehide', reset, { signal: controller.signal });
  return {
    dispose() {
      reset();
      controller.abort();
    },
  };
}
