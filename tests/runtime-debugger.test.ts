import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  entryPoints: ['src/runtime-debugger.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { RuntimeDebugger } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const location = (className, depth, sequence = 1) => ({
  thread: 1,
  frame: depth,
  className,
  depth,
  sequence,
  method: 'main',
  descriptor: '()V',
  pc: sequence - 1,
  line: sequence,
});
function debuggerAtReturn(depth = 3) {
  const vm = {
    _module: { _jaspera_debug_enable() {} },
    getActiveThread: () => ({ ptr: 1 }),
    scheduleTimeout() {},
  };
  const debug = new RuntimeDebugger(
    vm,
    { classes: ['Main'], stopOnEntry: true, breakpoints: [] },
    () => {},
  );
  assert.equal(debug.check(location('Main', 3)), true);
  if (depth > 3) {
    debug.command('into');
    assert.equal(debug.check(location('Helper', depth, 2)), true);
  }
  debug.frames = [{ instruction: { opcode: 'return' } }];
  return debug;
}
test('stepping past the root return does not enter unrelated runtime calls', () => {
  for (const command of ['over', 'into', 'out']) {
    const debug = debuggerAtReturn();
    debug.command(command);
    assert.equal(debug.check(location('java/io/PrintStream', 3, 2)), false);
    assert.equal(debug.check(location('java/lang/Thread', 4, 3)), false);
    debug.breakpoints([{ className: 'Main', line: 4 }]);
    assert.equal(debug.check(location('Main', 3, 4)), true);
  }
});
test('stepping past a nested return still stops in its caller', () => {
  for (const command of ['over', 'into', 'out']) {
    const debug = debuggerAtReturn(4);
    debug.command(command);
    assert.equal(debug.check(location('Main', 3, 3)), true);
  }
});
test('unwinding below the user root cancels pending steps', () => {
  const debug = debuggerAtReturn();
  debug.frames = [{ instruction: { opcode: 'athrow' } }];
  debug.command('over');
  assert.equal(debug.check(location('jalweb/Bridge', 2, 2)), false);
  assert.equal(debug.check(location('java/io/PrintStream', 3, 3)), false);
});
