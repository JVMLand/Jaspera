import { msg } from './messages.js';
import { bindMessage } from './localization';
import { resetFeatureGuides } from './feature-guides';
import { APP_NAME, APP_TAGLINE } from './brand';
import { BUILD_LABEL } from './build-info';
import './help.css';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function openHelp(title: string, content: Node[]) {
  let dialog = document.querySelector<HTMLDialogElement>('#help-dialog');
  if (!dialog) {
    dialog = element('dialog');
    dialog.id = 'help-dialog';
    document.body.append(dialog);
  }
  dialog.setAttribute('aria-labelledby', 'help-title');
  const heading = element('h2', title);
  heading.id = 'help-title';
  heading.tabIndex = -1;
  const form = element('form');
  form.method = 'dialog';
  const actions = element('div');
  actions.className = 'dialog-actions';
  actions.append(element('button', msg('mf6c244f98893')));
  form.append(heading, ...content, actions);
  dialog.replaceChildren(form);
  if (!dialog.open) dialog.showModal();
  heading.focus();
}
export function showHelpMessage(title: string, text: string) {
  openHelp(title, [element('p', text)]);
}

export function helpMenuItems() {
  return [
    {
      id: 'help-changelog',
      label: msg('changelog.title'),
      action: () => {
        void import('./changelog').then((m) => m.openChangelog());
      },
    },
    {
      id: 'help-manual',
      label: msg('m9a0311a5dd39'),
      action: () => {
        void import('./help-manual').then((m) => m.openFeatureManual());
      },
    },
    {
      id: 'help-language-docs',
      label: msg('help.langjal.docs'),
      action: () => window.open('https://jal.yamad.jp/docs/', '_blank', 'noopener,noreferrer'),
    },
    { id: 'help-guides', label: msg('m77331ff0ae04'), action: resetFeatureGuides },
    {
      id: 'help-offline',
      label: msg('m30e10cd9ae35'),
      action: () => {
        void import('./offline').then((m) => m.openOfflinePreparation());
      },
    },
    {
      id: 'help-langjal',
      label: msg('help.langjal.title'),
      action: () => {
        const description = element('p');
        bindMessage(description, 'help.langjal.description');
        const links = element('ul');
        links.className = 'help-links';
        for (const [label, href] of [
          ['help.langjal.website', 'https://jal.yamad.jp/docs/'],
          ['help.langjal.sandboxGuide', 'https://jal.yamad.jp/docs/usage/jaspera'],
          ['help.langjal.repository', 'https://github.com/jvmLand/langjal'],
        ] as const) {
          const link = element('a');
          bindMessage(link, label);
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          const item = element('li');
          item.append(link);
          links.append(item);
        }
        openHelp(msg('help.langjal.title'), [description, links]);
      },
    },
    {
      id: 'help-licenses',
      label: msg('help.licenses.title'),
      action: () => {
        void import('./licenses').then((m) => m.openLicenses());
      },
    },
    {
      id: 'help-about',
      label: msg('m9965ae4e8456', [APP_NAME]),
      action: () => {
        const version = element('p', BUILD_LABEL);
        version.className = 'app-version';
        version.translate = false;
        openHelp(APP_NAME, [
          version,
          element('p', APP_TAGLINE),
          element('p', msg('m9a8033004453')),
        ]);
      },
    },
  ];
}
