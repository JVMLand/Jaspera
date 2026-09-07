import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/instruction-guide.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {guide,instructionList,categories,category}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('every supported instruction has a category, explanation and diagram',()=>{assert.equal(new Set(instructionList).size,202);assert.ok(!instructionList.includes('aload_4'));for(const op of instructionList){const e=guide(op);assert.ok(categories.includes(e.category),op);assert.ok(e.summary.length>8,op);assert.ok(e.forms.length,op);}assert.deepEqual(instructionList.filter(op=>category(op)==='補助命令'),['nop','wide']);});
test('small primitive values occupy int stack entries',()=>{for(const op of ['i2b','i2c','i2s','baload','caload','saload'])assert.match(guide(op).forms[0].after[0],/: int$/);for(const op of ['bastore','castore','sastore'])assert.match(guide(op).forms[0].before.at(-1),/: int$/);});
test('local diagrams describe only stores and increments',()=>{assert.equal(guide('iload_1').forms[0].locals,undefined);assert.equal(guide('iadd').forms[0].locals,undefined);assert.ok(guide('istore_1').forms[0].locals);assert.deepEqual(guide('iinc').forms[0].before,[]);assert.deepEqual(guide('iinc').forms[0].locals.after,['#1: 4 : int']);});
test('stack manipulation variants keep ordering and category restrictions',()=>{const f=guide('dup2_x2').forms;assert.equal(f.length,4);assert.deepEqual(f[3].before,['value2','value1']);assert.deepEqual(f[3].after,['value1','value2','value1']);assert.match(f[3].note,/カテゴリ2/);assert.equal(guide('pop2').forms.length,2);assert.deepEqual(guide('swap').forms[0].after,['value1','value2']);});

test('editorial summaries keep operand order only where it matters',()=>{
 for(const op of ['iadd','lmul','iand','ior','ixor','if_icmpeq','if_acmpne'])assert.doesNotMatch(guide(op).summary,/先に積んだ|左側|右側|TOP の下/);
 assert.match(guide('isub').summary,/TOP の値を、その下の値から引き/);assert.match(guide('idiv').summary,/TOP の値で、その下の値を割り/);
 assert.match(guide('ishl').summary,/ビット数/);assert.match(guide('iand').forms[0].note,/両方のビット/);
 assert.match(guide('iadd').markdown,/オーバーフロー/);assert.doesNotMatch(guide('iadd').markdown,/IEEE|NaN|形式|スタック効果|先に積んだ/);
 assert.match(guide('idiv').markdown,/ArithmeticException/);assert.match(guide('fdiv').markdown,/NaN/);
 assert.doesNotMatch(guide('i2l').markdown,/NaN|丸め/);assert.match(guide('d2i').markdown,/NaN/);
 for(const op of instructionList)assert.doesNotMatch(guide(op).markdown,/##### \*\*(形式|スタック効果|例):/,op);
});

test('explanations distinguish behaviour rather than inheriting generic documentation',()=>{
 for(const op of instructionList)assert.ok(guide(op).markdown.length>30,op);
 assert.equal(new Set(['invokevirtual','invokeinterface','invokespecial','invokestatic','invokedynamic'].map(op=>guide(op).summary)).size,5);
 assert.match(guide('invokevirtual').markdown,/オーバーライド/);
 assert.match(guide('invokedynamic').markdown,/bootstrap.*CallSite/);
 assert.match(guide('if_acmpeq').markdown,/内容ではなく/);
 assert.match(guide('bastore').markdown,/下位 1 ビット/);
 assert.match(guide('caload').markdown,/ゼロ拡張/);
 assert.match(guide('saload').markdown,/符号を保って/);
 assert.match(guide('fcmpl').markdown,/NaN のときは −1/);
 assert.match(guide('fcmpg').markdown,/NaN のときは 1/);
 assert.doesNotMatch(guide('lcmp').forms[0].note,/NaN/);
 assert.match(guide('ret').markdown,/51.0/);
 assert.match(guide('putstatic').markdown,/<clinit>/);
 assert.doesNotMatch(guide('putstatic').example,/System->out/);
 assert.equal(guide('newarray').example,'newarray I');
 assert.match(guide('iconst_3').summary,/int の定数 3/);
});

test('related pages exist, exclude self, and keep other instruction behaviour out of the body',()=>{
 for(const op of instructionList){const related=guide(op).related;assert.equal(new Set(related).size,related.length,op);assert.ok(!related.includes(op),op);for(const target of related)assert.ok(instructionList.includes(target),`${op} -> ${target}`);}
 for(const op of ['ireturn','lreturn','freturn','dreturn','areturn','return']){
  assert.equal(guide(op).related.length,5);
  for(const other of guide(op).related)assert.doesNotMatch(guide(op).markdown,new RegExp('\\b'+other+'\\b'));
 }
 for(const [op,other] of [['iconst_1','bipush'],['pop','pop2'],['goto','goto_w'],['invokeinterface','invokestatic'],['ret','jsr_w']]){
  assert.ok(guide(op).related.includes(other));assert.doesNotMatch(guide(op).markdown,new RegExp('\\b'+other+'\\b'));
 }
});
