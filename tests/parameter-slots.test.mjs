import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/parameter-slots.js'],bundle:true,write:false,platform:'browser',format:'esm'});
const {parameterSlots}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const wrap=body=>'public class Main {\n'+body+'\n}';
test('parameters use local slots, category-2 values take two slots and arrays take one',()=>{
 const source=wrap('public static calc(II)V { return }\npublic calc(JD[I[[DLjava/lang/String;I)V { return }\npublic <init>(I)V { return }');
 const hints=parameterSlots(source);assert.deepEqual(hints.map(h=>h.slot),[0,1,1,3,5,6,7,8,1]);assert.deepEqual(hints.map(h=>source[h.offset]),['I','I','J','D','[','[','L','I','I']);assert.deepEqual(hints.map(h=>h.width),[1,1,2,2,1,1,1,1,1]);
});
test('only declaration parameters are annotated, never calls, literals or comments',()=>{
 const source=wrap('/* public static fake(II)V {} */\npublic static empty()V { ldc "fake(II)V"\n invokestatic Main->calc(II)V\n return }\npublic static calc(I)V { invalid_body }');
 assert.deepEqual(parameterSlots(source).map(h=>h.slot),[0]);assert.equal(source.slice(parameterSlots(source)[0].offset-5,parameterSlots(source)[0].offset),'calc(');
});
test('incomplete descriptors do not produce guessed hints; original offsets survive CRLF and Unicode',()=>{
 assert.deepEqual(parameterSlots(wrap('public static calc(I {')),[]);
 const source=wrap('// 😀 日本語\r\npublic static calc(ILjava/lang/String;)V { return }');
 assert.deepEqual(parameterSlots(source).map(h=>source.slice(h.offset,h.offset+1)),['I','L']);
});
