import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { launchBrowser, newAppPage, detachAt } from './helpers/browser.mjs';
test(
  'JAR classes can be edited, closed, reopened and exported with untouched resources',
  { timeout: 180000 },
  async (t) => {
    await mkdir('.cache/jar-ui', { recursive: true });
    const compile = (name) => {
      return (async () => {
        await writeFile(
          `.cache/jar-ui/${name}.jal`,
          `public class ${name} (major_version=67, minor_version=0) { public static value()I { iconst_1 ireturn } }`,
        );
        const result = spawnSync(
          'java',
          [
            '-cp',
            'public/runtime/jalweb-compiler.jar',
            'jalweb.Bridge',
            `.cache/jar-ui/${name}.jal`,
          ],
          { encoding: 'utf8' },
        );
        assert.equal(result.status, 0, result.stderr);
        const json = JSON.parse(result.stdout);
        assert.ok(json.bytecode, result.stdout);
        return Buffer.from(json.bytecode, 'base64');
      })();
    };
    const original = await compile('Sample'),
      other = await compile('Other');
    const archive = zipSync({
      'Sample.class': original,
      'Other.class': other,
      'data/settings.txt': strToU8('preserve me'),
      'assets/image.bin': new Uint8Array([0, 255, 3]),
    });
    const server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5291', '--strictPort'],
      { stdio: 'pipe', windowsHide: true },
    );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch('http://127.0.0.1:5291')).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    page.setDefaultTimeout(90000);
    await page.goto('http://127.0.0.1:5291');
    await page.evaluate(async () => {
      window.testMain = await import('/src/main.ts');
    });
    await page.waitForFunction(
      () => document.querySelector('#state')?.textContent === '実行できます',
    );
    await page.locator('#file-input').setInputFiles({
      name: 'library.jar',
      mimeType: 'application/java-archive',
      buffer: Buffer.from(archive),
    });
    await page.locator('#file-list button[title="library.jar/Sample.class"]').click();
    await page.waitForFunction(() => {
      const app = window.testMain;
      return (
        app.editor.getModel()?.getValue().includes('class Sample') &&
        !app.editor.getRawOptions().readOnly
      );
    });
    await page.evaluate(async () => {
      const app = window.testMain;
      if (!app.editor.getModel()?.getValue().includes('class Sample'))
        throw Error('Wrong editor: ' + app.editor.getModel()?.getValue());
      app.editor
        .getModel()
        .setValue(app.editor.getModel().getValue().replace('iconst_1', 'iconst_2'));
    });
    await page.locator('#menu-file').click();
    await page.locator('#close-tab').click();
    await page.locator('#file-list button[title="library.jar/Sample.class"]').click();
    await page.waitForFunction(() => {
      const app = window.testMain;
      return app.editor.getModel()?.getValue().includes('iconst_2');
    });
    await page.locator('#file-list button[title="library.jar/data/settings.txt"]').click();
    await page.waitForFunction(() => {
      const app = window.testMain;
      return app.editor.getModel()?.getValue() === 'preserve me';
    });
    await page.locator('#file-list button[title="library.jar/Sample.class"]').click();
    await page.waitForFunction(() =>
      window.testMain.editor.getModel()?.getValue().includes('iconst_2'),
    );
    const updated = await page.evaluate(() => {
      window.jarModel = window.testMain.editor.getModel();
      return window.jarModel.getValue().replace('iconst_2', 'iconst_3');
    });
    const popupEvent = page.waitForEvent('popup');
    await detachAt(
      page,
      await page.getByRole('tab', { name: 'Sample.class', exact: true }).boundingBox(),
    );
    const popup = await popupEvent;
    const input = popup.getByRole('textbox', { name: 'Editor content', exact: true });
    await input.focus();
    await popup.keyboard.press('Control+a');
    await popup.keyboard.insertText(updated);
    await page.waitForFunction(() => window.jarModel.getValue().includes('iconst_3'));
    const downloading = page.waitForEvent('download');
    await popup.locator('#menu-file').click();
    await popup.locator('#download-jar').click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'library.jar');
    await download.saveAs('.cache/jar-ui/edited.jar');
    const files = unzipSync(await readFile('.cache/jar-ui/edited.jar'));
    assert.deepEqual(Buffer.from(files['Other.class']), other);
    assert.deepEqual(files['assets/image.bin'], new Uint8Array([0, 255, 3]));
    assert.equal(new TextDecoder().decode(files['data/settings.txt']), 'preserve me');
    await writeFile('.cache/jar-ui/Sample.class', files['Sample.class']);
    const disasm = spawnSync('javap', ['-c', '.cache/jar-ui/Sample.class'], { encoding: 'utf8' });
    assert.equal(disasm.status, 0, disasm.stderr);
    assert.match(disasm.stdout, /iconst_3/);
    await popup.close();

    // A source-only assignment ZIP opens one preview, not one model per entry.
    const answers = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [
        `answers/Answer${i}.jal`,
        strToU8(`public class Answer${i} {}`),
      ]),
    );
    answers['answers/Main.java'] = strToU8('public class Main { /* 日本語 */ }');
    await page.locator('#file-input').setInputFiles({
      name: 'answers.ZIP',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipSync(answers)),
    });
    await page.waitForFunction(() => {
      const app = window.testMain;
      return (
        app.editor.getModel()?.getValue() === 'public class Answer0 {}' &&
        app.editor.getModel()?.getLanguageId() === 'jal' &&
        app.editor.getRawOptions().readOnly
      );
    });
    assert.equal(
      await page.evaluate(async () => {
        const platform = await import('/src/editor-platform.ts');
        return platform.editor.getModels().filter((model) => model.uri.authority === 'jar').length;
      }),
      1,
    );
    await page.locator('#file-list button[title="answers.ZIP/answers/Main.java"]').click();
    await page.waitForFunction(
      () => window.testMain.editor.getModel()?.getValue() === 'public class Main { /* 日本語 */ }',
    );
    assert.ok(await page.evaluate(() => window.testMain.editor.getRawOptions().readOnly));
    const zipDownloading = page.waitForEvent('download');
    await page.locator('#menu-file').click();
    await page.locator('#download-jar').click();
    const zipDownload = await zipDownloading;
    assert.equal(zipDownload.suggestedFilename(), 'answers.ZIP');
    await zipDownload.saveAs('.cache/jar-ui/answers.zip');
    assert.deepEqual(unzipSync(await readFile('.cache/jar-ui/answers.zip')), answers);
  },
);
