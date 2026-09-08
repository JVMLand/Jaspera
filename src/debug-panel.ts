import { msg } from './messages.js';
import type { DebugCommand, DebugState, DebugFrame } from './debug-protocol';
import { renderFrameTransition } from './frame-transition';
import { predictDebugFrame } from './debug-prediction';
import './debug-panel.css';
export interface DebugActions {
  start(): void;
  command(command: DebugCommand): void;
  stop(): void;
  toggleIgnoreBreakpoints(): void;
  reveal(frame: DebugFrame): void;
}
export function debugCommandEnabled(state: DebugState | undefined, id: string) {
  if (id === 'debug-ignore-breakpoints') return true;
  const status = state?.status;
  if (id === 'debug-stop')
    return status === 'starting' || status === 'running' || status === 'paused';
  if (id === 'debug-pause') return status === 'running';
  return status === 'paused';
}
export function updateDebugMenu(
  menus: { disabled(id: string, value: boolean): void; checked(id: string, value: boolean): void },
  state: DebugState | undefined,
) {
  for (const id of [
    'debug-continue',
    'debug-over',
    'debug-into',
    'debug-out',
    'debug-pause',
    'debug-stop',
  ])
    menus.disabled(id, !debugCommandEnabled(state, id));
  menus.checked('debug-ignore-breakpoints', !!state?.ignoreBreakpoints);
}
export function debugMenuItems(actions: DebugActions) {
  return [
    { id: 'debug-start', label: msg('m2f13ffc43a6d'), shortcut: 'Shift+F5', action: actions.start },
    {
      id: 'debug-continue',
      label: msg('m788935e0a245'),
      shortcut: 'F8',
      action: () => actions.command('continue'),
    },
    { id: 'debug-pause', label: msg('mb8aaf2c6e030'), action: () => actions.command('pause') },
    {
      id: 'debug-over',
      label: msg('m0259fd6a7bf9'),
      shortcut: 'F10',
      action: () => actions.command('over'),
    },
    {
      id: 'debug-into',
      label: msg('mb1e84d37ea6a'),
      shortcut: 'F11',
      action: () => actions.command('into'),
    },
    {
      id: 'debug-out',
      label: msg('m472c720694de'),
      shortcut: 'Shift+F11',
      action: () => actions.command('out'),
    },
    { id: 'debug-stop', label: msg('mca4d973c0b00'), action: actions.stop },
    {
      id: 'debug-ignore-breakpoints',
      label: msg('debug.ignoreBreakpoints'),
      action: actions.toggleIgnoreBreakpoints,
    },
  ];
}
export function installDebugKeys(actions: DebugActions, state: () => DebugState | undefined) {
  const listener = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const key = e.key;
    if (e.shiftKey && key !== 'F5' && key !== 'F11') return;
    if (key === 'F5' && e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      actions.start();
      return;
    }
    const command =
      key === 'F8'
        ? 'continue'
        : key === 'F10'
          ? 'over'
          : key === 'F11'
            ? e.shiftKey
              ? 'out'
              : 'into'
            : undefined;
    if (command && debugCommandEnabled(state(), 'debug-' + command)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      actions.command(command);
    }
  };
  window.addEventListener('keydown', listener, true);
  return { dispose: () => window.removeEventListener('keydown', listener, true) };
}
export function installDebugPanel(root: HTMLElement, actions: DebugActions) {
  root.classList.add('debug-panel');
  const toolbar = document.createElement('div');
  toolbar.className = 'debug-toolbar';
  toolbar.hidden = true;
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', msg('ma6fec8bbb87f'));
  const stateLabel = document.createElement('p');
  stateLabel.className = 'debug-status';
  stateLabel.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'debug-frames';
  list.setAttribute('aria-label', msg('m99ad7e61e867'));
  const content = document.createElement('div');
  content.className = 'debug-values';
  const icons: Record<string, string> = {
    'debug-ignore-breakpoints': '<circle cx="12" cy="12" r="7"/><path d="m4 20 16-16"/>',
    'debug-continue': '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
    'debug-pause': '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    'debug-over':
      '<path d="M4 12a8 8 0 0 1 16 0m-4-3 4 3 2-4"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/>',
    'debug-into':
      '<path d="M12 3v12m-4-4 4 4 4-4"/><circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none"/>',
    'debug-out':
      '<path d="M12 15V3m-4 4 4-4 4 4"/><circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none"/>',
    'debug-stop':
      '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  };
  const indicator = document.createElement('span');
  indicator.className = 'debug-toolbar-state';
  toolbar.append(indicator);
  const buttons = debugMenuItems(actions)
    .filter((item) => item.id !== 'debug-start')
    .map((item) => {
      const b = document.createElement('button');
      b.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
        icons[item.id] +
        '</svg>';
      b.title = item.label + (item.shortcut ? '（' + item.shortcut + '）' : '');
      b.setAttribute('aria-label', item.label);
      b.dataset.command = item.id;
      b.onclick = item.action;
      toolbar.append(b);
      return b;
    });
  document.body.append(toolbar);
  root.replaceChildren(stateLabel, list, content);
  let state: DebugState | undefined,
    selected = 0;
  const waiting = msg('ma6a1d0493b22');
  const labels = {
    idle: waiting,
    starting: msg('m6f92c03c2818'),
    running: msg('md82113a7a9c6'),
    paused: msg('m4d9c2e5034e9'),
    finished: waiting,
  };
  function render() {
    if (!state) return;
    stateLabel.textContent = labels[state.status];
    const paused = state.status === 'paused',
      active = paused || state.status === 'running' || state.status === 'starting';
    toolbar.hidden = !active;
    toolbar.dataset.state = state.status;
    indicator.textContent = paused
      ? msg('m72eea71385de')
      : state.status === 'starting'
        ? msg('m9e305eab23dd')
        : msg('md82113a7a9c6');
    buttons.forEach((b) => {
      const id = b.dataset.command;
      b.hidden = id === 'debug-continue' ? !paused : id === 'debug-pause' ? paused : false;
      b.disabled = !debugCommandEnabled(state, id!);
      if (id === 'debug-ignore-breakpoints')
        b.setAttribute('aria-pressed', String(!!state?.ignoreBreakpoints));
    });
    list.replaceChildren();
    content.replaceChildren();
    if (!paused || !state.snapshot) return;
    state.snapshot.frames.forEach((f, i) => {
      const b = document.createElement('button');
      b.textContent =
        f.className.replaceAll('/', '.') +
        '.' +
        f.method +
        f.descriptor +
        (f.native ? '（native）' : ' · ' + f.pc);
      b.className = i === selected ? 'selected' : '';
      b.onclick = () => {
        selected = i;
        render();
        actions.reveal(f);
      };
      list.append(b);
    });
    const frame = state.snapshot.frames[selected] ?? state.snapshot.frames[0];
    if (!frame) return;
    if (frame.native) {
      content.textContent = msg('mea43aff2daff');
      return;
    }
    const prediction = predictDebugFrame(frame);
    if (selected > 0 && frame.callSnapshot) prediction.beforeLabel = msg('mb4fdfd2b05f7');
    else if (selected > 0) {
      prediction.after = [];
      prediction.consumed = 0;
      prediction.produced = 0;
      prediction.locals = undefined;
      prediction.terminal = msg('m815e19f20208');
      prediction.note = undefined;
    }
    content.append(renderFrameTransition(prediction));
  }
  return {
    update(next: DebugState | undefined) {
      if (next === state) return;
      if (next?.snapshot !== state?.snapshot) selected = 0;
      state = next ?? { status: 'idle', breakpoints: [] };
      render();
    },
    dispose() {
      toolbar.remove();
      root.replaceChildren();
    },
  };
}
