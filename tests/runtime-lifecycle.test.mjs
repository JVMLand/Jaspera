import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { launchBrowser, newAppContext, newAppPage } from './helpers/browser.mjs';
test(
  'runtime resets output limits and signals debugger readiness before execution',
  { timeout: 120000 },
  async (t) => {
    const base = 'http://127.0.0.1:5257',
      server = spawn(
        process.execPath,
        ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5257', '--strictPort'],
        { stdio: 'pipe', windowsHide: true },
      );
    t.after(() => server.kill());
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await launchBrowser({
      headless: true,
    });
    t.after(() => browser.close());
    const page = await newAppPage(browser);
    await page.goto(base + '/tests/harness.html');
    const result = await page.evaluate(async () => {
      const { Runtime } = await import('/src/runtime.ts');
      const vm = new Runtime();
      let output = '';
      vm.onOutput = (_, text) => (output += text);
      try {
        const large =
          await vm.compile(`public class Main { public static main([Ljava/lang/String;)V {
    getstatic java/lang/System->out:Ljava/io/PrintStream;
    ldc "x"
    ldc 300000
    invokevirtual java/lang/String->repeat(I)Ljava/lang/String;
    invokevirtual java/io/PrintStream->print(Ljava/lang/String;)V
    return
   } }`);
        if (!large.bytecode) throw Error(JSON.stringify(large.diagnostics));
        await vm.run(large, '');
        const first = output;
        output = '';
        await vm.run(large, '');
        const second = output;
        output = '';
        const small =
          await vm.compile(`public class Main { public static main([Ljava/lang/String;)V {
    getstatic java/lang/System->out:Ljava/io/PrintStream;
    ldc "hello"
    invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V
    return
   } }`);
        const order = [];
        vm.onDebugReady = () => order.push('ready');
        vm.onDebug = (s) => {
          order.push('paused');
          void vm.debugCommand('continue');
        };
        await vm.run(small, '', { stopOnEntry: true, classes: ['Main'], breakpoints: [] });
        return { first, second, output, order };
      } finally {
        vm.stop();
      }
    });
    assert.match(result.first, /256 KiB/);
    assert.equal(result.second, result.first);
    assert.equal(result.output, 'hello\n');
    assert.deepEqual(result.order, ['ready', 'paused']);
    const anchors = await page.evaluate(async () => {
      const monaco = await import('/src/editor-platform.ts'),
        { BreakpointStore } = await import('/src/breakpoint-store.ts');
      let points = [];
      const store = new BreakpointStore((p) => (points = p));
      const a = monaco.editor.createModel(
        'a\nb\nc',
        'plaintext',
        monaco.Uri.parse('inmemory://test/a.jal'),
      );
      store.toggle(a, 2);
      a.pushEditOperations(
        [],
        [{ range: new monaco.Range(1, 1, 1, 1), text: 'inserted\n' }],
        () => null,
      );
      const inserted = points[0].line;
      a.undo();
      const undone = points[0].line;
      const b = monaco.editor.createModel(
        a.getValue(),
        'plaintext',
        monaco.Uri.parse('inmemory://test/b.jal'),
      );
      store.move(a, b);
      a.dispose();
      const moved = points;
      b.dispose();
      const removed = points;
      store.dispose();
      return { inserted, undone, moved, removed };
    });
    assert.equal(anchors.inserted, 3);
    assert.equal(anchors.undone, 2);
    assert.deepEqual(anchors.moved, [{ uri: 'inmemory://test/b.jal', line: 2 }]);
    assert.deepEqual(anchors.removed, []);
  },
);
