import { msg } from './messages.js';
import type { SearchTarget } from './navigation';
import type { Catalog } from './completion';
import './search-everywhere.css';
let jdk: Promise<SearchTarget[]> | undefined;
function library() {
  return (jdk ??= import('./generated/jdk.json')
    .then((module) => {
      const targets: SearchTarget[] = [];
      for (const [owner, members] of Object.entries(module.default as Catalog)) {
        const detail = owner.replaceAll('/', '.');
        targets.push({ kind: 'class', label: owner.split('/').pop()!, detail, owner });
        for (const member of members) {
          const split =
            member.kind === 'field' ? member.name.indexOf(':') : member.name.indexOf('(');
          targets.push({
            kind: member.kind,
            label: member.name,
            detail,
            owner,
            name: member.name.slice(0, split),
            descriptor: member.name.slice(split + (member.kind === 'field' ? 1 : 0)),
          });
        }
      }
      return targets;
    })
    .catch((error) => {
      jdk = undefined;
      throw error;
    }));
}
import { searchTargets } from './search-ranking';
export function installSearchEverywhere(
  workspace: () => Promise<SearchTarget[]>,
  open: (target: SearchTarget) => Promise<() => void | Promise<void>>,
) {
  const dialog = document.createElement('dialog');
  dialog.className = 'search-everywhere';
  dialog.setAttribute('aria-label', msg('m4f2a06aba30f'));
  dialog.innerHTML = msg('mcdf342526df6');
  document.body.append(dialog);
  const input = dialog.querySelector('input')!,
    list = dialog.querySelector<HTMLDivElement>('[role=listbox]')!,
    status = dialog.querySelector('p')!;
  let all: SearchTarget[] = [],
    rows: SearchTarget[] = [],
    selected = 0,
    version = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    opening = false,
    previous: HTMLElement | null = null;
  const highlight = () => {
    for (const [i, child] of [...list.children].entries())
      child.setAttribute('aria-selected', String(i === selected));
    input.setAttribute('aria-activedescendant', 'everywhere-' + selected);
    list.children[selected]?.scrollIntoView({ block: 'nearest' });
  };
  const render = () => {
    rows = searchTargets(all, input.value);
    selected = 0;
    list.replaceChildren();
    for (const [i, target] of rows.entries()) {
      const row = document.createElement('div');
      row.id = 'everywhere-' + i;
      row.setAttribute('role', 'option');
      const kind = document.createElement('span');
      kind.className = 'search-kind';
      kind.textContent = {
        file: msg('m2b39ec3da17e'),
        class: msg('m428926567c1a'),
        method: msg('m99942ce88f0b'),
        field: msg('mdb132d621cb1'),
      }[target.kind];
      const title = document.createElement('strong');
      title.textContent = target.label;
      const detail = document.createElement('small');
      detail.textContent = target.detail;
      row.append(kind, title, detail);
      row.onclick = () => {
        selected = i;
        void choose();
      };
      list.append(row);
    }
    status.textContent = rows.length
      ? msg('m32b573b66067', [rows.length, rows.length === 100 ? msg('m8d1740df6215') : ''])
      : msg('mbf18fbb2cc25');
    highlight();
  };
  async function choose() {
    const target = rows[selected];
    if (!target || opening) return;
    opening = true;
    const current = version;
    status.textContent = msg('m0f1be67e7930');
    try {
      const reveal = await open(target);
      if (current === version) {
        dialog.close('opened');
        await reveal();
      }
    } catch (error) {
      if (current === version)
        status.textContent = error instanceof Error ? error.message : msg('mfbe152e63373');
    } finally {
      opening = false;
    }
  }
  async function show() {
    if (dialog.open || document.querySelector('dialog[open]')) return;
    previous = document.activeElement as HTMLElement;
    input.value = '';
    all = [];
    list.replaceChildren();
    status.textContent = msg('m03876eb6f5da');
    dialog.showModal();
    input.focus();
    const current = ++version;
    const results = await Promise.allSettled([workspace(), library()]);
    if (current !== version || !dialog.open) return;
    all = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    render();
    if (results.some((result) => result.status === 'rejected'))
      status.textContent = msg('m1933268e3a9b');
  }
  dialog.querySelector('button')!.onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    clearTimeout(timer);
    timer = undefined;
    ++version;
    all = [];
    rows = [];
    list.replaceChildren();
    if (dialog.returnValue !== 'opened') previous?.focus();
    dialog.returnValue = '';
  });
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      render();
    }, 100);
  };
  input.onkeydown = (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dialog.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      selected = Math.max(
        0,
        Math.min(rows.length - 1, selected + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      highlight();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      clearTimeout(timer);
      if (timer) {
        render();
        timer = undefined;
      }
      void choose();
    }
  };
  let last = 0,
    down = false,
    alone = false;
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      if (!event.repeat) {
        down = true;
        alone = !event.ctrlKey && !event.altKey && !event.metaKey;
      }
    } else {
      alone = false;
      last = 0;
    }
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.key !== 'Shift') return;
    if (down && alone) {
      const now = performance.now();
      if (last && now - last < 450) {
        last = 0;
        void show();
      } else last = now;
    }
    down = false;
    alone = false;
  };
  const reset = () => {
    last = 0;
    down = false;
    alone = false;
  };
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup, true);
  window.addEventListener('blur', reset);
  window.addEventListener('pointerdown', reset, true);
  return {
    show,
    dispose() {
      ++version;
      clearTimeout(timer);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', reset);
      window.removeEventListener('pointerdown', reset, true);
      dialog.remove();
    },
  };
}
