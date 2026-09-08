import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { launchBrowser, newAppPage, createTestProject, detachAt } from './helpers/browser.mjs';
test(
  'declaration completion inserts descriptors in main and detached editors; main variants execute',
  { timeout: 180000 },
  async (t) => {
    const server = await createServer({
      server: { host: '127.0.0.1', port: 5268, strictPort: true },
    });
    await server.listen();
    t.after(() => server.close());
    const browser = await launchBrowser();
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    await page.goto('http://127.0.0.1:5268');
    await createTestProject(page);
    for (const [typed, expected] of [
      ['String', 'Ljava/lang/String;'],
      ['[String', '[Ljava/lang/String;'],
      ['int', 'I'],
      ['IString', 'ILjava/lang/String;'],
    ]) {
      await page.keyboard.press('Escape');
      await page.evaluate(async () => {
        const { editor } = await import('/src/main.ts');
        editor.setValue('public class Main {\n public calc()V { return }\n}');
        editor.setPosition({ lineNumber: 2, column: 14 });
        editor.focus();
      });
      await page.keyboard.type(typed, { delay: 35 });
      await page.keyboard.press('ControlOrMeta+Space');
      const label = typed === 'IString' ? 'Ljava/lang/String;' : expected;
      await page
        .locator('.suggest-widget.visible .monaco-list-row')
        .filter({ hasText: label })
        .first()
        .click();
      assert.match(
        await page.evaluate(async () => (await import('/src/main.ts')).editor.getValue()),
        new RegExp('calc\\(' + expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\)V'),
      );
    }
    const popupEvent = page.waitForEvent('popup');
    await detachAt(page, await page.getByRole('tab', { name: 'Main', exact: true }).boundingBox());
    const popup = await popupEvent;
    await popup.getByRole('tab', { name: 'Main', exact: true }).waitFor();
    await popup.evaluate(async () => {
      const { editor } = await import('/src/detached.ts');
      editor.setValue('public class Main {\n public calc()V { return }\n}');
      editor.setPosition({ lineNumber: 2, column: 14 });
      editor.focus();
    });
    await popup.keyboard.type('String', { delay: 35 });
    await popup.keyboard.press('ControlOrMeta+Space');
    await popup
      .locator('.suggest-widget.visible .monaco-list-row')
      .filter({ hasText: 'Ljava/lang/String;' })
      .first()
      .click();
    assert.ok(
      (
        await popup.evaluate(async () => (await import('/src/detached.ts')).editor.getValue())
      ).includes('calc(Ljava/lang/String;)V'),
    );
    await popup.close();
    await page.goto('http://127.0.0.1:5268/tests/harness.html');
    const results = await page.evaluate(async () => {
      const { Runtime } = await import('/src/runtime.ts');
      const vm = new Runtime();
      const results = [];
      let stdout = '';
      vm.onOutput = (stream, text) => {
        if (stream === 'stdout') stdout += text;
      };
      const execute = async (c, debug) => {
        stdout = '';
        await vm.run(c, '', debug);
        return { stdout };
      };
      try {
        const print = (value) =>
          `getstatic java/lang/System->out:Ljava/io/PrintStream;\nldc "${value}"\ninvokevirtual java/io/PrintStream->println(Ljava/lang/String;)V\nreturn`;
        for (const signature of [
          'public static main([Ljava/lang/String;)V',
          'public static main()V',
          'public main([Ljava/lang/String;)V',
          'main()V',
        ]) {
          const c = await vm.compile(`public class Main {\n ${signature} {\n${print('ok')}\n}\n}`);
          if (!c.bytecode) throw Error(JSON.stringify(c.diagnostics));
          results.push(await execute(c));
        }
        const source = `public class Main {\n public value:I\n public <init>()V {\n aload_0\n invokespecial java/lang/Object-><init>()V\n aload_0\n bipush 42\n putfield Main->value:I\n return\n }\n public main()V {\n getstatic java/lang/System->out:Ljava/io/PrintStream;\n aload_0\n getfield Main->value:I\n invokevirtual java/io/PrintStream->println(I)V\n return\n }\n}`;
        const c = await vm.compile(source);
        if (!c.bytecode) throw Error(JSON.stringify(c.diagnostics));
        let stopped;
        const pause = new Promise(
          (resolve) =>
            (vm.onDebug = (s) => {
              stopped = s;
              resolve(s);
            }),
        );
        const run = execute(c, {
          stopOnEntry: false,
          classes: ['Main'],
          breakpoints: [{ className: 'Main', line: 13 }],
        });
        await pause;
        results.push({ method: stopped.location.method, locals: stopped.frames[0].locals });
        await vm.debugCommand('continue');
        results.push(await run);
        const both = await vm.compile(
          `public class Main { public static main()V {${print('empty')}} public main([Ljava/lang/String;)V {${print('args')}} }`,
        );
        results.push(await execute(both));
      } finally {
        vm.stop();
      }
      return results;
    });
    for (const result of results.slice(0, 4)) {
      assert.equal(result.stdout, 'ok\n');
      assert.equal(result.error, undefined);
    }
    assert.equal(results[4].method, 'main');
    assert.ok(results[4].locals.length);
    assert.equal(results[5].stdout, '42\n');
    assert.equal(results[6].stdout, 'args\n');
  },
);
