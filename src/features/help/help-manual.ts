import manualTemplate from './manual.html?raw';
import { renderTemplate } from '../../i18n/template';
import startTemplate from './manual-start.html?raw';
import editorTemplate from './manual-editor.html?raw';
import instructionsTemplate from './manual-instructions.html?raw';
import debugTemplate from './manual-debug.html?raw';
import graphTemplate from './manual-graph.html?raw';
import navigationTemplate from './manual-navigation.html?raw';
import filesTemplate from './manual-files.html?raw';
import layoutTemplate from './manual-layout.html?raw';
import shortcutsTemplate from './manual-shortcuts.html?raw';
import offlineTemplate from './manual-offline.html?raw';
import { bindMessage } from '../../localization';
import { displayMessage } from '../../messages.js';
import './help-manual.css';

// Authored HTML only. Do not interpolate source code or user input into these pages.
const topics = [
  { id: 'start', title: 'help.runYourFirstProgram', body: startTemplate },
  { id: 'editor', title: 'help.writeCode', body: editorTemplate },
  { id: 'instructions', title: 'help.exploreInstructionsAndTheStack', body: instructionsTemplate },
  { id: 'debug', title: 'help.pauseAndInspectValues', body: debugTemplate },
  { id: 'graph', title: 'common.followTheInstructionGraph', body: graphTemplate },
  { id: 'navigation', title: 'help.findFilesAndDefinitions', body: navigationTemplate },
  { id: 'files', title: 'help.saveFilesAndProjects', body: filesTemplate },
  { id: 'layout', title: 'help.arrangeTabsAndWindows', body: layoutTemplate },
  { id: 'shortcuts', title: 'help.keyboardShortcuts', body: shortcutsTemplate },
  { id: 'offline', title: 'help.workOffline', body: offlineTemplate },
] as const;

export function openFeatureManual() {
  const existing = document.querySelector<HTMLDialogElement>('#feature-manual');
  if (existing) {
    if (!existing.open) existing.showModal();
    return;
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'feature-manual';
  dialog.translate = false;
  dialog.setAttribute('aria-labelledby', 'feature-manual-title');
  dialog.innerHTML = renderTemplate(manualTemplate, [], true);
  const nav = dialog.querySelector('nav')!,
    article = dialog.querySelector('article')!;
  for (const topic of topics) {
    const button = document.createElement('button');
    button.type = 'button';
    bindMessage(button, topic.title);
    button.onclick = () => {
      for (const item of nav.querySelectorAll('button')) item.removeAttribute('aria-current');
      button.setAttribute('aria-current', 'page');
      const title = document.createElement('h2');
      title.id = 'manual-topic-title';
      title.textContent = displayMessage(topic.title);
      article.replaceChildren(title);
      article.insertAdjacentHTML('beforeend', renderTemplate(topic.body, [], true));
      article.scrollTop = 0;
    };
    nav.append(button);
  }
  nav.querySelector('button')!.click();
  dialog.querySelector<HTMLButtonElement>('.manual-close')!.onclick = () => dialog.close();
  const languageChanged = () => {
    const shell = document.createElement('template');
    shell.innerHTML = renderTemplate(manualTemplate, [], true);
    dialog.querySelector('header')!.replaceWith(shell.content.querySelector('header')!);
    nav.setAttribute('aria-label', shell.content.querySelector('nav')!.getAttribute('aria-label')!);
    dialog.querySelector<HTMLButtonElement>('.manual-close')!.onclick = () => dialog.close();
    nav.querySelector<HTMLButtonElement>('[aria-current]')?.click();
  };
  window.addEventListener('jaspera:locale', languageChanged);
  dialog.addEventListener(
    'close',
    () => {
      window.removeEventListener('jaspera:locale', languageChanged);
      dialog.remove();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  nav.querySelector('button')!.focus();
}
