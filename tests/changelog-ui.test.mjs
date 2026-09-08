import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchBrowser, newAppContext } from './helpers/browser.mjs';
const currentVersion = JSON.parse(await readFile('package.json', 'utf8')).version.replace(
  /\.0$/,
  '',
);
const langs = ['ja', 'en', 'zh', 'es', 'it', 'fr', 'la'];
test('every release has localized text and screenshots, including the package version', async () => {
  const versions = (await readdir('src/changelog', { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(versions.includes(pkg.version.replace(/\.0$/, '')));
  for (const version of versions)
    for (const lang of langs) {
      const entry = JSON.parse(await readFile(`src/changelog/${version}/${lang}.json`, 'utf8'));
      for (const key of ['title', 'introduction', 'imageAlt'])
        assert.ok(entry[key]?.trim(), `${version}/${lang}/${key}`);
      assert.ok(entry.sections.length > 0);
      for (const section of entry.sections) assert.ok(section.title && section.body);
      assert.ok((await stat(`src/changelog/${version}/${lang}.jpg`)).size > 1000);
    }
});
test(
  'changelog opens once after upgrade, browses all locales, and stays lazy on first visit',
  { timeout: 120000 },
  async (t) => {
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5297, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const first = await newAppContext(browser);
    const initial = await first.newPage();
    const images = [];
    initial.on('request', (r) => {
      if (r.resourceType() === 'image' && r.url().includes('changelog')) images.push(r.url());
    });
    await initial.goto('http://127.0.0.1:5297');
    await initial.waitForFunction(
      (version) => localStorage.getItem('jaspera.lastVersion') === version,
      currentVersion,
    );
    assert.equal(await initial.locator('#changelog').count(), 0);
    assert.equal(images.length, 0);
    await first.close();
    const context = await newAppContext(browser);
    await context.addInitScript(() => {
      if (!localStorage.getItem('jaspera.lastVersion'))
        localStorage.setItem('jaspera.lastVersion', '2026.1');
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5297');
    await page.locator('#changelog article h1').waitFor();
    assert.match(
      await page.locator('#changelog article h1').textContent(),
      new RegExp('^' + currentVersion.replace('.', '\\.')),
    );
    await page.locator('#changelog nav button').filter({ hasText: '2026.1' }).click();
    await page.waitForFunction(() =>
      document.querySelector('#changelog article h1')?.textContent.startsWith('2026.1'),
    );
    for (const lang of langs) {
      await page.evaluate(async (lang) => {
        const { setLocale } = await import('/src/localization.ts');
        await setLocale(lang);
      }, lang);
      await page.waitForFunction(
        (lang) => document.querySelector('#changelog img')?.src.includes(`/${lang}.jpg`),
        lang,
      );
      await page.waitForFunction(() => {
        const img = document.querySelector('#changelog img');
        return img?.complete && img.naturalWidth > 0;
      });
    }
    await page.keyboard.press('Escape');
    await page.locator('#changelog').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#changelog').count(), 0);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('jaspera.lastVersion')),
      currentVersion,
    );
    await page.reload();
    await page.locator('#run').waitFor();
    assert.equal(await page.locator('#changelog').count(), 0);
    await page.locator('.feature-guide-skip:visible').click();
    await page.locator('#menu-help').click();
    await page.locator('#help-changelog').click();
    await page.locator('#changelog article h1').waitFor();
    await page.screenshot({ path: '.cache/changelog-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.locator('#changelog').boundingBox();
    assert.ok(box.width <= 390);
    await page.screenshot({ path: '.cache/changelog-mobile.png' });
    await page.locator('.changelog-close').click();
    await page.locator('#changelog').waitFor({ state: 'detached' });
    const compared = await page.evaluate(async () => {
      const { compareVersions } = await import('/src/changelog-state.ts');
      return [
        compareVersions('2026.10', '2026.2'),
        compareVersions('2026.1', '2026.2'),
        compareVersions('bad', '2026.2'),
      ];
    });
    assert.ok(compared[0] > 0 && compared[1] < 0 && compared[2] === 0);
    await page.evaluate(async () => {
      const dialog = document.createElement('dialog');
      dialog.id = 'blocking-dialog';
      document.body.append(dialog);
      dialog.showModal();
      localStorage.setItem('jaspera.lastVersion', '2026.1');
      (await import('/src/changelog-state.ts')).initializeChangelog();
    });
    assert.equal(await page.locator('#changelog').count(), 0);
    await page.evaluate(() => document.querySelector('#blocking-dialog').close());
    await page.locator('#changelog article h1').waitFor();
    await page.locator('.changelog-close').click();
    await page.locator('#changelog').waitFor({ state: 'detached' });
    await page.evaluate(async () => {
      localStorage.setItem('jaspera.lastVersion', '2027.1');
      (await import('/src/changelog-state.ts')).initializeChangelog();
    });
    assert.equal(await page.locator('#changelog').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('jaspera.lastVersion')), '2027.1');
    await context.close();
  },
);
