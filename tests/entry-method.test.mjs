import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({
  entryPoints: ['src/entry-method.js'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const { entryMethods, entryProblem } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
test('entry selection follows runtime signatures, access and construction requirements', () => {
  for (const signature of [
    'public static main()V',
    'public main([Ljava/lang/String;)V',
    'main()V',
    'static main([Ljava/lang/String;)V',
  ])
    assert.equal(
      entryProblem(entryMethods(`public class Main { ${signature} { return } }`)),
      '',
      signature,
    );
  for (const body of [
    '// public main()V { return }',
    'public helper()V { return }',
    'private static main()V { return }',
    'public main(I)V { return }',
    'public main()I { iconst_0 ireturn }',
    'public main(',
  ])
    assert.equal(entryProblem(entryMethods(`public class Main {\n${body}\n}`)), 'run.noMain', body);
  assert.equal(
    entryProblem(entryMethods('public abstract class Main { public abstract main()V {} }')),
    'run.abstractMain',
  );
  assert.equal(
    entryProblem(
      entryMethods('public class Main { public <init>(I)V {return} public main()V {return} }'),
    ),
    'run.noConstructor',
  );
  assert.equal(
    entryProblem(
      entryMethods(
        'public class Main { public <init>(I)V {return} public static main()V {return} }',
      ),
    ),
    '',
  );
});
test('workspace inherited main is found without treating an unrelated helper main as entry', () => {
  const base = entryMethods('public class Base { public main()V {return} }');
  const child = { ...entryMethods('public class Child {}'), parent: 'Base' };
  assert.equal(entryProblem(child, [base]), '');
  assert.equal(entryProblem({ ...child, parent: 'java/lang/Object' }, [base]), 'run.noMain');
});
