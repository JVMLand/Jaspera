import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';
const source=`public class Main (major_version=67, minor_version=0) {
 public static sample(I)I {
  iload_0
  ifle L
  iconst_1
  istore_1
  iinc 1 1
  iload_1
  ireturn
 L:
  iconst_0
  ireturn
 }
 public static operations(I)V {
  iload_0
  iload_0
  iload_0
  iadd
  dup
  pop
  pop2
  nop
  return
 }
 public static categoryTwo()V {
  lconst_0
  lstore_0
  return
 }
 public static main([Ljava/lang/String;)V {
  getstatic java/lang/System->out:Ljava/io/PrintStream;
  ldc "Hello"
  invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V
  return
 }
}`;
await mkdir('.cache/stack-hover',{recursive:true});await writeFile('.cache/stack-hover/Main.jal',source);
const run=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge','.cache/stack-hover/Main.jal'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout);assert.ok(result.bytecode,JSON.stringify(result.diagnostics));
const frame=opcode=>result.stackFrames.find(f=>source.split('\n')[f.line-1].trim().startsWith(opcode));
test('loads and branches show before and after with no locals payload',()=>{assert.deepEqual(frame('iload_0').before,[]);assert.deepEqual(frame('iload_0').after,['int']);assert.equal(frame('iload_0').localsBefore,undefined);assert.deepEqual(frame('ifle').before,['int']);assert.deepEqual(frame('ifle').after,[]);assert.deepEqual(frame('iconst_0').before,[]);});
test('stores and iinc identify the changed local and its operation',()=>{assert.deepEqual(frame('istore_1').before,['1 : int']);assert.deepEqual(frame('istore_1').after,[]);assert.equal(frame('istore_1').local,1);assert.deepEqual(frame('istore_1').localsBefore,['int']);assert.deepEqual(frame('istore_1').localsAfter,['int','1 : int']);assert.equal(frame('iinc').effect,'#1 ← #1 + 1');});
test('long occupies one stack value and two local slots',()=>{assert.deepEqual(frame('lstore_0').before,['0 : long']);assert.deepEqual(frame('lstore_0').localsAfter,['0 : long','継続スロット']);});
test('member calls retain meaningful reference types',()=>{assert.deepEqual(frame('getstatic').after,['java.io.PrintStream']);assert.deepEqual(frame('invokevirtual').before,['java.io.PrintStream','"Hello" : java.lang.String']);assert.deepEqual(frame('invokevirtual').after,[]);});

test('effects count consumed and produced values even when their types match',()=>{assert.equal(frame('iadd').consumed,2);assert.equal(frame('iadd').produced,1);assert.equal(frame('iadd').before.length,3);assert.equal(frame('dup').consumed,1);assert.equal(frame('dup').produced,2);assert.equal(frame('nop').consumed,0);assert.equal(frame('nop').produced,0);assert.equal(frame('lstore_0').consumed,1);assert.equal(frame('invokevirtual').consumed,2);assert.equal(frame('ireturn').terminal,'メソッド終了');});
