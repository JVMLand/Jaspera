import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

test('stack literals keep Unicode readable and preserve literal escapes when shortened', async () => {
  const values = [
    'こんにちは，JAL！',
    'é中文😀',
    String.raw`\u3053`,
    'line\n"quote"\t',
    '😀'.repeat(50),
  ];
  const source = `public class UnicodeFrames {
    public static main()V {
      ${values.map((value) => `ldc ${JSON.stringify(value)}\npop`).join('\n')}
      return
    }
  }`;
  await mkdir('.cache/stack-unicode', { recursive: true });
  const path = '.cache/stack-unicode/UnicodeFrames.jal';
  await writeFile(path, source);
  const run = spawnSync(
    'java',
    ['-cp', 'public/runtime/jalweb-compiler.jar', 'jalweb.Bridge', path],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.ok(result.bytecode, JSON.stringify(result.diagnostics));
  const frames = result.stackFrames.filter((frame) =>
    source.split('\n')[frame.line - 1].trim().startsWith('ldc '),
  );
  assert.equal(frames.length, values.length);
  for (const [index, value] of values.entries()) {
    const expected = [...value].length > 42 ? [...value].slice(0, 42).join('') + '…' : value;
    const display = frames[index].after.at(-1).replace(/ : (?:java\.lang\.)?String$/, '');
    assert.equal(display, JSON.stringify(expected));
    assert.equal(JSON.parse(display), expected);
  }
});
