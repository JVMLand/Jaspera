import { bindTranslation, localizedMessage } from './localization';
import './run-menu.css';

export function installRunMenu(
  runButton: HTMLButtonElement,
  start: (ignoreBreakpoints: boolean) => void,
) {
  const wrapper = document.createElement('div');
  wrapper.className = 'run-split';
  runButton.before(wrapper);
  wrapper.append(runButton);
  const trigger = document.createElement('button');
  trigger.id = 'run-options';
  trigger.type = 'button';
  trigger.className = 'run';
  trigger.innerHTML = '<span aria-hidden="true">▾</span>';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'run-options-menu');
  bindTranslation(trigger, () => {
    trigger.title = localizedMessage('run.options');
    trigger.setAttribute('aria-label', trigger.title);
  });
  wrapper.append(trigger);
  const menu = document.createElement('div');
  menu.id = 'run-options-menu';
  menu.className = 'run-options-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-labelledby', trigger.id);
  menu.hidden = true;
  document.body.append(menu);
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let enabled = !runButton.disabled;
  const close = (focus = false) => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  };
  const items = [false, true].map((ignore) => {
    const button = document.createElement('button');
    button.id = ignore ? 'run-without-breakpoints' : 'run-with-debugger';
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    bindTranslation(button, () => {
      button.textContent = localizedMessage(ignore ? 'run.normal' : 'run.debug');
    });
    button.onclick = () => {
      close();
      if (enabled) start(ignore);
    };
    menu.append(button);
    return button;
  });
  const open = () => {
    if (!enabled) return;
    menu.hidden = false;
    const box = trigger.getBoundingClientRect();
    menu.style.top = box.bottom + 4 + 'px';
    menu.style.left =
      Math.max(8, Math.min(box.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8)) + 'px';
    trigger.setAttribute('aria-expanded', 'true');
    items[0].focus();
  };
  trigger.onclick = () => (menu.hidden ? open() : close(true));
  trigger.onkeydown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open();
    }
  };
  menu.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (current + 1) % 2].focus();
    }
  };
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!wrapper.contains(event.target as Node) && !menu.contains(event.target as Node)) close();
    },
    options,
  );
  document.addEventListener(
    'focusin',
    (event) => {
      if (!wrapper.contains(event.target as Node) && !menu.contains(event.target as Node)) close();
    },
    options,
  );
  window.addEventListener('resize', () => close(), options);
  return {
    update(canStart: boolean) {
      enabled = canStart;
      trigger.disabled = !canStart;
      if (!canStart) close();
    },
    dispose() {
      controller.abort();
      menu.remove();
      trigger.remove();
      wrapper.replaceWith(runButton);
    },
  };
}
