import { installPresentationPanelSizing } from './presentation-panel-sizing';
import { textSize, setTemporaryTextSize } from './text-size';
import { msg } from './messages.js';
import { bindTranslation, localizedMessage } from './localization';
import './presentation.css';

let disposePanelSizing: (() => void) | undefined;
let active = false;
let ownsFullscreen = false;
let generation = 0;
let exitButton: HTMLButtonElement | undefined;

function stop() {
  if (!active) return;
  active = false;
  disposePanelSizing?.();
  disposePanelSizing = undefined;
  ++generation;
  document.documentElement.removeAttribute('data-presentation');
  document.documentElement.removeAttribute('data-presentation-project');
  window.dispatchEvent(new Event('jaspera:presentation'));
  setTemporaryTextSize();
  exitButton?.remove();
  exitButton = undefined;
  if (ownsFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  ownsFullscreen = false;
}

function start() {
  active = true;
  const ticket = ++generation;
  const size = textSize();
  setTemporaryTextSize({ editor: Math.max(28, size.editor), ui: Math.max(20, size.ui) });
  document.documentElement.setAttribute('data-presentation', '');
  disposePanelSizing = installPresentationPanelSizing();
  window.dispatchEvent(new Event('jaspera:presentation'));
  exitButton = document.createElement('button');
  exitButton.id = 'presentation-exit';
  exitButton.type = 'button';
  bindTranslation(exitButton, () => {
    if (!exitButton) return;
    exitButton.textContent = localizedMessage('presentation.exit');
    const key = document.createElement('kbd');
    key.textContent = 'Esc';
    exitButton.append(key);
  });
  exitButton.onclick = stop;
  document.body.append(exitButton);
  // Keep the user gesture: request fullscreen before any asynchronous work.
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    ownsFullscreen = true;
    void document.documentElement
      .requestFullscreen()
      .then(() => {
        if (ticket !== generation && document.fullscreenElement)
          void document.exitFullscreen().catch(() => {});
      })
      .catch(() => {
        if (ticket === generation) ownsFullscreen = false;
      });
  }
}

export function presentationMenuItem() {
  return {
    id: 'presentation-mode',
    label: msg('presentation.title'),
    action: () => (active ? stop() : start()),
  };
}

document.addEventListener('fullscreenchange', () => {
  if (active && ownsFullscreen && !document.fullscreenElement) stop();
});
window.addEventListener(
  'keydown',
  (event) => {
    if (
      !active ||
      event.key !== 'Escape' ||
      event.isComposing ||
      document.querySelector(
        'dialog[open], .menu-popup:not([hidden]), #run-options-menu:not([hidden])',
      )
    )
      return;
    event.preventDefault();
    stop();
  },
  true,
);

// The View menu can bring the project tree back during a presentation.
document.addEventListener(
  'click',
  (event) => {
    if (active && event.target instanceof Element && event.target.closest('#show-project'))
      document.documentElement.setAttribute('data-presentation-project', '');
  },
  true,
);
