import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export * from './src/compilation-service'; export * from './src/workspace-state';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {CompilationService,WorkspaceStateStore}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function backend(){
 const calls=[];let stopped=0;
 return {calls,get stopped(){return stopped;},compile(source){return new Promise((resolve,reject)=>calls.push({source,resolve,reject}));},stop(){stopped++;for(const call of calls)call.reject(new Error('stopped'));}};
}
test('views share compilation in flight and serialize different document revisions',async()=>{
 const worker=backend(),service=new CompilationService(worker),document={};
 const first=service.compile(document,'old');assert.equal(service.compile(document,'old'),first);
 await tick();const second=service.compile(document,'new');await tick();assert.deepEqual(worker.calls.map(c=>c.source),['old']);
 worker.calls[0].resolve({className:'Old'});assert.equal((await first).className,'Old');await tick();assert.deepEqual(worker.calls.map(c=>c.source),['old','new']);
 worker.calls[1].resolve({className:'New'});assert.equal((await second).className,'New');assert.equal(service.compile(document,'new'),second);
 const reopened=service.compile({},'new');await tick();assert.equal(worker.calls.length,3);worker.calls[2].resolve({className:'Reopened'});await reopened;service.dispose();
});
test('failed old revisions do not discard newer work; failures can be retried',async()=>{
 const worker=backend(),service=new CompilationService(worker),document={};
 const old=service.compile(document,'old'),failure=assert.rejects(old,/failed/);await tick();const next=service.compile(document,'new');
 await tick();worker.calls[0].reject(new Error('failed'));await failure;await tick();assert.equal(service.compile(document,'new'),next);
 const nextFailure=assert.rejects(next,/again/);worker.calls[1].reject(new Error('again'));await nextFailure;
 const retry=service.compile(document,'new');await tick();assert.equal(worker.calls.length,3);worker.calls[2].resolve({});await retry;service.dispose();
});
test('disposing stops the owned compiler and rejects queued requests without restarting it',async()=>{
 const worker=backend(),service=new CompilationService(worker);
 const active=service.compile({},'one'),queued=service.compile({},'two');
 const checks=[assert.rejects(active,/stopped/),assert.rejects(queued,/終了/)];await tick();service.dispose();await Promise.all(checks);
 assert.equal(worker.stopped,1);assert.equal(worker.calls.length,1);await assert.rejects(service.compile({},'three'),/終了/);
});
test('state notifications deliver complete changes and stop after unsubscribe',async()=>{
 const store=new WorkspaceStateStore(),seen=[],unsubscribe=store.subscribe(()=>seen.push(store.value));
 store.update({running:true});store.updateTools({output:[{text:'hello',stream:'stdout'}]});store.update({status:'running'});
 assert.equal(seen.length,0);await tick();assert.equal(seen.length,1);assert.equal(seen[0].status,'running');assert.equal(seen[0].tools.output[0].text,'hello');
 store.updateTools({stdin:'input'});await tick();assert.equal(seen[0].tools.stdin,'');assert.equal(seen[1].tools.stdin,'input');
 unsubscribe();store.update({running:false});await tick();assert.equal(seen.length,2);
});

test('queued obsolete revisions are skipped without changing results for active work',async()=>{
 const worker=backend(),service=new CompilationService(worker),doc={};
 const active=service.compile({},'blocker');await tick();
 const skipped=[];for(let i=0;i<5;i++)skipped.push(assert.rejects(service.compile(doc,'version'+i),{name:'AbortError'}));
 const latest=service.compile(doc,'latest');worker.calls[0].resolve({});await active;await Promise.all(skipped);await tick();
 assert.deepEqual(worker.calls.map(c=>c.source),['blocker','latest']);worker.calls[1].resolve({className:'Latest'});assert.equal((await latest).className,'Latest');service.dispose();
});
