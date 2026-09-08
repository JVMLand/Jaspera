import { msg } from './messages.js';
import { autoUpdate, computePosition, offset, flip, shift, arrow } from '@floating-ui/dom';
import './feature-guides.css';

interface Guide {
  id: string;
  title: string;
  text: string;
  target: string;
  trigger?: string;
  context?: boolean;
}
const tab = (name: string) => `[data-panel="${name}"] [role="tab"]`;
const selected = (name: string) => tab(name) + '[aria-selected="true"]';
const guides: Guide[] = [
  {
    id: 'debug',
    title: msg('m6d94f74d1eb3'),
    text: msg('m25d7b8c28b99'),
    target: '.debug-toolbar:not([hidden])[data-state="paused"]',
    context: true,
  },
  {
    id: 'instructions',
    title: msg('mff3bc1cee969'),
    text: msg('mf5e5d5aeffa2'),
    target: selected('instructions'),
    trigger: tab('instructions'),
    context: true,
  },
  {
    id: 'graph',
    title: msg('ma3cd8c2dab66'),
    text: msg('mab7c3b72bf23'),
    target: selected('graph'),
    trigger: tab('graph'),
    context: true,
  },
  {
    id: 'problems',
    title: msg('m8120a77552a8'),
    text: msg('mef58950fd12e'),
    target: selected('problems'),
    trigger: tab('problems'),
    context: true,
  },
  { id: 'run', title: msg('m3aae3ef0e5ba'), text: msg('m6c0032948a04'), target: '#run' },
  {
    id: 'project',
    title: msg('m6b4280944084'),
    text: msg('m1fbcc9bcc602'),
    target: selected('project'),
    trigger: tab('project'),
  },
  {
    id: 'tabs',
    title: msg('m65930baa5111'),
    text: msg('m75f2eebf7b3a'),
    target: '[data-pane-kind="editor"] [role="tab"][aria-selected="true"]',
    trigger: '[data-pane-kind="editor"] [role="tab"]',
  },
  {
    id: 'breakpoints',
    title: msg('mb60bcf0b9ffc'),
    text: msg('m120cc7d0c252'),
    target: '.jal-breakpoint-slot[data-guide="hello-breakpoint"]',
    trigger: '.jal-breakpoint-slot[data-guide="hello-breakpoint"]',
  },
  {
    id: 'console',
    title: msg('m2857058320bb'),
    text: msg('m71c9817e539b'),
    target: selected('console'),
    trigger: tab('console'),
    context: true,
  },
  {
    id: 'view',
    title: msg('md77919f32578'),
    text: msg('m77e8f878cc2e'),
    target: '#menu-view',
    trigger: '#menu-view',
    context: true,
  },
  {
    id: 'file',
    title: msg('md278d7fa1323'),
    text: msg('m2dfebe9d85f4'),
    target: '#menu-file',
    trigger: '#menu-file',
    context: true,
  },
  {
    id: 'edit',
    title: msg('m8bbabb24110d'),
    text: msg('m3a502674d174'),
    target: '#menu-edit',
    trigger: '#menu-edit',
    context: true,
  },
  {
    id: 'build',
    title: msg('m9d5f837f2510'),
    text: msg('m0e6b5a3a6466'),
    target: '#menu-build',
    trigger: '#menu-build',
    context: true,
  },
];
const prefix = 'jaspera.guide.dismissed.';
let installed = false;
export function resetFeatureGuides() {
  window.dispatchEvent(new Event('jaspera:reset-guides'));
}
export function installFeatureGuides() {
  if (installed) return;
  installed = true;
  const dismissed = new Set<string>();
  const read = () => {
    for (const guide of guides) {
      try {
        if (localStorage.getItem(prefix + guide.id) === '1') dismissed.add(guide.id);
        else dismissed.delete(guide.id);
      } catch {
        /* Storage may be disabled; retain session choices. */
      }
    }
  };
  read();
  const bubble = document.createElement('aside');
  bubble.className = 'feature-guide';
  bubble.hidden = true;
  bubble.setAttribute('role', 'note');
  bubble.setAttribute('aria-labelledby', 'feature-guide-title');
  const title = document.createElement('h2');
  title.id = 'feature-guide-title';
  const text = document.createElement('p');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'feature-guide-close';
  close.textContent = '×';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'feature-guide-skip';
  skip.textContent = msg('mad710be9236b');
  const tip = document.createElement('span');
  tip.className = 'feature-guide-arrow';
  tip.setAttribute('aria-hidden', 'true');
  bubble.append(title, close, text, skip, tip);
  document.body.append(bubble);
  let current: Guide | undefined,
    target: HTMLElement | undefined,
    cleanup: (() => void) | undefined,
    request = 0,
    epoch = 0,
    preferred: string | undefined;
  const visible = (node: HTMLElement) => {
    const r = node.getBoundingClientRect();
    return (
      !node.closest('[hidden]') &&
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.top < innerHeight &&
      r.right > 0 &&
      r.left < innerWidth &&
      getComputedStyle(node).visibility !== 'hidden'
    );
  };
  function hide() {
    epoch++;
    cleanup?.();
    cleanup = undefined;
    current = undefined;
    target = undefined;
    bubble.hidden = true;
  }
  function refresh() {
    request = 0;
    if (
      document.querySelector(
        'dialog[open],.menu-popup:not([hidden]),[role="menu"]:not([hidden]):not(.menu-popup)',
      )
    ) {
      hide();
      return;
    }
    const options = guides.filter(
      (g) =>
        !dismissed.has(g.id) &&
        (!g.context ||
          g.id === preferred ||
          ['debug', 'instructions', 'graph', 'problems'].includes(g.id)),
    );
    options.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    let next: Guide | undefined, anchor: HTMLElement | undefined;
    for (const guide of options) {
      const node = [...document.querySelectorAll<HTMLElement>(guide.target)].find(visible);
      if (node) {
        next = guide;
        anchor = node;
        break;
      }
    }
    if (!next || !anchor) {
      hide();
      return;
    }
    if (next === current && anchor === target) return;
    hide();
    current = next;
    target = anchor;
    const token = epoch;
    title.textContent = next.title;
    text.textContent = next.text;
    close.setAttribute('aria-label', next.title + msg('mdff70799deaa'));
    bubble.dataset.guide = next.id;
    bubble.hidden = false;
    bubble.style.visibility = 'hidden';
    const position = () => {
      void computePosition(anchor!, bubble, {
        strategy: 'fixed',
        placement: 'bottom',
        middleware: [
          offset(18),
          flip({ boundary: [], fallbackPlacements: ['top'] }),
          shift({ boundary: [], padding: 12 }),
          arrow({ element: tip, padding: 16 }),
        ],
      }).then(({ x, y, placement, middlewareData }) => {
        if (token !== epoch) return;
        Object.assign(bubble.style, { left: x + 'px', top: y + 'px', visibility: 'visible' });
        const side = placement.split('-')[0],
          opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side]!;
        Object.assign(tip.style, { left: '', top: '', right: '', bottom: '' });
        if (middlewareData.arrow?.x !== undefined) tip.style.left = middlewareData.arrow.x + 'px';
        if (middlewareData.arrow?.y !== undefined) tip.style.top = middlewareData.arrow.y + 'px';
        tip.style.setProperty(opposite, '-5px');
        bubble.dataset.side = side;
      });
    };
    cleanup = autoUpdate(anchor, bubble, position);
  }
  const schedule = () => {
    if (!request) request = requestAnimationFrame(refresh);
  };
  function dismiss(ids: string[]) {
    for (const id of ids) {
      dismissed.add(id);
      try {
        localStorage.setItem(prefix + id, '1');
      } catch {}
    }
    preferred = undefined;
    hide();
    schedule();
  }
  close.onclick = () => {
    if (current) dismiss([current.id]);
  };
  skip.onclick = () => dismiss(guides.map((guide) => guide.id));
  const interact = (event: Event) => {
    if (!(event.target instanceof Element) || bubble.contains(event.target)) return;
    const guide = guides.find(
      (g) => g.trigger && event.target instanceof Element && event.target.closest(g.trigger),
    );
    if (guide) preferred = guide.id;
    schedule();
  };
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(prefix)) {
      read();
      schedule();
    }
  };
  const reset = () => {
    for (const guide of guides) {
      dismissed.delete(guide.id);
      try {
        localStorage.removeItem(prefix + guide.id);
      } catch {}
    }
    preferred = undefined;
    hide();
    schedule();
  };
  const observer = new MutationObserver((records) => {
    if (records.some((record) => !bubble.contains(record.target))) schedule();
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'aria-selected', 'open'],
  });
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('click', interact, true);
  document.addEventListener('focusin', interact, true);
  window.addEventListener('resize', schedule);
  window.addEventListener('storage', storage);
  window.addEventListener('jaspera:reset-guides', reset);
  window.addEventListener(
    'pagehide',
    () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      cleanup?.();
      bubble.remove();
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('click', interact, true);
      document.removeEventListener('focusin', interact, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('storage', storage);
      window.removeEventListener('jaspera:reset-guides', reset);
      installed = false;
    },
    { once: true },
  );
  schedule();
}
