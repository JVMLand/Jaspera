import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
test('shared syntax snapshots work over Comlink and recover after incomplete edits',{timeout:40000},async t=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5236','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());const base='http://127.0.0.1:5236';
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(base+'/tests/harness.html');
 const result=await page.evaluate(async()=>{
  const {WorkerRpc}=await import('/src/worker-rpc.ts'),{default:Worker}=await import('/src/offsets.worker.ts?worker');
  const rpc=new WorkerRpc(()=>new Worker());
  try{
   const source='public class Main { public static calc(I)V {\n bipush 1\n pop\n return\n}}';
   const first=await rpc.call(api=>api.analyze(source));
   const broken=await rpc.call(api=>api.analyze(source.replace('bipush 1','bipush')));
   const repaired=await rpc.call(api=>api.analyze(source));
   const large=await rpc.call(api=>api.analyze('public class Main { public static calc()V {\n'+'nop\n'.repeat(1000)+'return\n}}'));
   const formatted=await rpc.call(api=>api.format('public class Main { public static calc()V { Start: return }}',{}));
   return {first,broken,repaired,large:large.offsets.length,formatted};
  }finally{rpc.dispose();}
 });
 assert.deepEqual(result.repaired,result.first);assert.equal(result.first.parameters[0].slot,0);assert.equal(result.first.inspections[0].code,'short-push');assert.ok(result.broken.offsets.length<result.first.offsets.length);assert.equal(result.large,1001);assert.match(result.formatted,/\n  Start:\n/);
});
