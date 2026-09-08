import { currentLocale, localizedMessage } from './localization';
import { compareVersions, lastVersionKey } from './changelog-state';
import './changelog.css';
type Entry = {
  title: string;
  introduction: string;
  imageAlt: string;
  sections: { title: string; body: string }[];
};
const pages = import.meta.glob<{ default: Entry }>('./changelog/*/*.json');
const images = import.meta.glob<string>('./changelog/*/*.jpg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const versions = [...new Set(Object.keys(pages).map((path) => path.split('/')[2]))]
  .filter((version) => compareVersions(version, __APP_VERSION__) <= 0)
  .sort((a, b) => compareVersions(b, a));
export function openChangelog(initial = __APP_VERSION__) {
  const existing = document.querySelector<HTMLDialogElement>('#changelog');
  if (existing) {
    existing.focus();
    return;
  }
  const dialog = document.createElement('dialog');
  dialog.id = 'changelog';
  dialog.translate = false;
  dialog.setAttribute('aria-labelledby', 'changelog-title');
  const header = document.createElement('header'),
    heading = document.createElement('h2'),
    close = document.createElement('button');
  heading.id = 'changelog-title';
  close.type = 'button';
  close.textContent = '×';
  close.className = 'changelog-close';
  header.append(heading, close);
  const layout = document.createElement('div');
  layout.className = 'changelog-layout';
  const nav = document.createElement('nav'),
    article = document.createElement('article');
  article.tabIndex = 0;
  article.setAttribute('aria-live', 'polite');
  layout.append(nav, article);
  dialog.append(header, layout);
  let selected = versions.includes(initial) ? initial : versions[0],
    generation = 0,
    viewedCurrent = false;
  const render = async () => {
    const token = ++generation;
    heading.textContent = localizedMessage('changelog.title');
    close.setAttribute('aria-label', localizedMessage('changelog.close'));
    nav.setAttribute('aria-label', localizedMessage('changelog.versions'));
    for (const button of nav.querySelectorAll('button')) {
      if (button.textContent === selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    article.textContent = localizedMessage('changelog.loading');
    const locale = currentLocale(),
      version = selected;
    try {
      const load = pages[`./changelog/${version}/${locale}.json`];
      if (!load) throw new Error('Missing release notes');
      const { default: entry } = await load();
      if (token !== generation || !dialog.isConnected) return;
      const title = document.createElement('h1');
      title.textContent = `${version} — ${entry.title}`;
      const intro = document.createElement('p');
      intro.textContent = entry.introduction;
      const image = document.createElement('img');
      image.src = images[`./changelog/${version}/${locale}.jpg`];
      image.alt = entry.imageAlt;
      image.loading = 'lazy';
      image.decoding = 'async';
      article.replaceChildren(title, intro, image);
      for (const section of entry.sections) {
        const h = document.createElement('h2'),
          p = document.createElement('p');
        h.textContent = section.title;
        p.textContent = section.body;
        article.append(h, p);
      }
      article.scrollTop = 0;
      if (version === __APP_VERSION__) viewedCurrent = true;
    } catch {
      if (token === generation) article.textContent = localizedMessage('changelog.error');
    }
  };
  for (const version of versions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = version;
    button.onclick = () => {
      selected = version;
      void render();
    };
    nav.append(button);
  }
  const languageChanged = () => void render();
  window.addEventListener('jaspera:locale', languageChanged);
  close.onclick = () => dialog.close();
  dialog.addEventListener(
    'close',
    () => {
      generation++;
      window.removeEventListener('jaspera:locale', languageChanged);
      if (viewedCurrent)
        try {
          const previous = localStorage.getItem(lastVersionKey);
          if (!previous || compareVersions(__APP_VERSION__, previous) >= 0)
            localStorage.setItem(lastVersionKey, __APP_VERSION__);
        } catch {}
      dialog.remove();
    },
    { once: true },
  );
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
  void render();
}
