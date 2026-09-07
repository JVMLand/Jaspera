import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const b=await build({entryPoints:['src/source-merge.ts'],bundle:true,write:false,format:'esm'});const {sourceMerge}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
test('external changes never replace unsaved local edits or removals',()=>{
 for(const [base,local,remote] of [['old','mine','theirs'],['old','mine',undefined],['old',undefined,'theirs'],[undefined,'mine','theirs']])assert.equal(sourceMerge(base,local,remote),'conflict');
 for(const [base,local,remote] of [['old','old','new'],['old','new','new'],['old','old',undefined],[undefined,undefined,'new']])assert.equal(sourceMerge(base,local,remote),'apply');
 assert.equal(sourceMerge('old','mine','old'),'unchanged');
});
