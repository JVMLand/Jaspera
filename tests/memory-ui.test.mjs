import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from '@playwright/test';
test('small and standard heaps share analysis/disassembly, release idle workers, and restart safely',{timeout:240000},async t=>{
 const base='http://127.0.0.1:5224',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5224','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 for(const capacity of [4,16])await t.test('deviceMemory='+capacity,async()=>{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
  await page.addInitScript(capacity=>Object.defineProperty(navigator,'deviceMemory',{value:capacity}),capacity);await page.goto(base);await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行できます');
  const workers=()=>page.workers().filter(w=>w.url().includes('runtime.worker'));
  assert.equal(workers().length,1);const original=workers()[0];
  const compiled=await page.evaluate(async()=>window.jalwebDetached.compileUsage('public class MemoryProbe { public static value()I { iconst_5 ireturn } }'));assert.deepEqual(compiled.diagnostics,[]);
  await page.evaluate(encoded=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],'MemoryProbe.class'));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},compiled.bytecode);
  await page.waitForFunction(()=>document.querySelector('#state')?.textContent.includes('逆アセンブルしました'));assert.equal(workers().length,1);assert.equal(workers()[0],original);
  await page.getByRole('tab',{name:'Main',exact:true}).click();
  await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.setPosition(editor.getModel().getPositionAt(editor.getValue().indexOf('->out')+3));editor.trigger('memory-test','editor.action.revealDefinition',{});});
  await page.waitForFunction(async()=>(await import('/src/main.ts')).editor.getModel().uri.authority==='definition');assert.equal(workers().length,1);assert.equal(workers()[0],original);
  await page.getByRole('tab',{name:'Main',exact:true}).click();
  const heavy=await page.evaluate(()=>window.jalwebDetached.compileUsage('public class Heavy { public static main([Ljava/lang/String;)V {\n'+'nop\n'.repeat(1000)+'return\n} }'));assert.deepEqual(heavy.diagnostics,[]);assert.equal(heavy.stackFrames.length,1001);
  // Shorten only the idle timer while dispatching visibility, with no active job.
  const closed=new Promise(resolve=>original.once('close',resolve));await page.evaluate(async()=>{
   const policy=(await import('/src/memory-policy.ts')).memoryPolicy(navigator.deviceMemory),timer=window.setTimeout;
   window.setTimeout=(fn,ms,...args)=>timer(fn,ms===policy.backgroundIdleMs?10:ms,...args);
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.setTimeout=timer;
  });await closed;assert.equal(workers().length,0);
  await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
  const cached=await page.evaluate(()=>window.jalwebDetached.compileUsage('public class Heavy { public static main([Ljava/lang/String;)V {\n'+'nop\n'.repeat(1000)+'return\n} }'));assert.equal(cached.bytecode,heavy.bytecode);assert.equal(workers().length,0);
  const restarted=await page.evaluate(()=>window.jalwebDetached.compileUsage('public class Restarted { public static test()V { return } }'));assert.deepEqual(restarted.diagnostics,[]);assert.equal(workers().length,1);
  for(let i=0;i<3;i++){await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行が完了しました');assert.equal(await page.locator('#output').textContent(),'Hello, World!\n');assert.equal(workers().length,1);}
  assert.deepEqual(errors,[]);await page.close();
 });
});
