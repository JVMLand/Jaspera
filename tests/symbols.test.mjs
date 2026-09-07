import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const b=await build({entryPoints:['src/symbols.js'],bundle:true,write:false,platform:'browser',format:'esm'});const {analyzeSymbols}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const source=`public class Main (super_class=Base, interfaces=Face) {
 public static value:I
 public static main([Ljava/lang/String;)V {
  getstatic java/lang/System->out:Ljava/io/PrintStream;
  ldc "java/lang/System->out:Ljava/io/PrintStream;"
  invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V
  return
 }
 public same()I { L: iconst_0 goto L ireturn }
 public other()V { L: goto L }
}`;
test('index includes class hierarchy, fields and exact method descriptors',()=>{const c=analyzeSymbols(source).classes[0];assert.equal(c.owner,'Main');assert.deepEqual(c.parents,['Base','Face']);assert.equal(c.members[0].name,'value');assert.equal(c.members[1].descriptor,'([Ljava/lang/String;)V');});
test('member names, owners and descriptor object types have distinct reference spans',()=>{const refs=analyzeSymbols(source).references;const member=refs.find(r=>r.kind==='method'&&r.name==='println');assert.equal(member.owner,'java/io/PrintStream');assert.equal(member.descriptor,'(Ljava/lang/String;)V');assert.equal(source.slice(member.start,member.end),'println');assert.equal(refs.filter(r=>r.kind==='field'&&r.name==='out').length,1);assert.equal(refs.filter(r=>r.kind==='class'&&r.owner==='java/io/PrintStream').length,2);});
test('same-named labels resolve within their own method',()=>{const refs=analyzeSymbols(source).references.filter(r=>r.kind==='label'&&r.name==='L');assert.equal(new Set(refs.map(r=>r.target.start)).size,2);});
test('comments and string contents never become reference links',()=>{const r=analyzeSymbols('public class A { public a()V { /* new java/lang/Object */ ldc "java/lang/String" return } }');assert.deepEqual(r.references,[]);});

test('incomplete instructions do not remove other method definitions from the symbol index',()=>{
 const result=analyzeSymbols('public class Partial { public static before()I { iconst_1 ireturn } public static broken()V { bipush ? return } public static after()I { iconst_2 ireturn } }');
 assert.deepEqual(result.classes[0].members.map(m=>m.name),['before','broken','after']);
});
