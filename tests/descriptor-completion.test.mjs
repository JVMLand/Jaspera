import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  entryPoints: ['src/descriptor-completion.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { descriptorContext, completeDescriptor } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
);
const catalog = { 'java/lang/String': [], 'java/util/List': [], Helper: [] };
test('declaration descriptors complete after preceding arguments and fields', () => {
  for (const partial of ['', 'String', 'Ljava/lang/Str', '[String', '[[I', 'List', 'Helper']) {
    const prefix = 'public class Main {\n public value:I\n public calc(I' + partial;
    const context = descriptorContext(prefix);
    assert.ok(context, partial);
    if (partial !== '[[I') assert.equal(context.partial, partial);
  }
});
test('types use descriptors and void is restricted to scalar return types', () => {
  assert.equal(completeDescriptor('String', false, catalog)[0].insertText, 'Ljava/lang/String;');
  assert.equal(
    completeDescriptor('[Ljava/lang/Str', false, catalog)[0].insertText,
    '[Ljava/lang/String;',
  );
  assert.equal(completeDescriptor('List', false, catalog)[0].insertText, 'Ljava/util/List;');
  assert.equal(completeDescriptor('int', false, catalog)[0].insertText, 'I');
  assert.equal(completeDescriptor('void', false, catalog).length, 0);
  assert.equal(completeDescriptor('[void', true, catalog).length, 0);
  assert.equal(completeDescriptor('void', true, catalog)[0].insertText, 'V');
  assert.equal(descriptorContext('public class Main {\n public main()').returns, true);
});
test('calls, strings and comments do not become method declarations', () => {
  for (const source of [
    'public class Main {\n public main()V {\n invokevirtual X->f(',
    'public class Main {\n // main(',
    'public class Main {\n public value:Ljava/lang/String; = "main("',
  ])
    assert.equal(descriptorContext(source), undefined);
});
