import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from '@playwright/test';
test('all dictionary examples compile with frames, and usage hovers share the compiler',{timeout:240000},async t=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5218','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());const base='http://127.0.0.1:5218';for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(60000);if(process.env.JALWEB_DEVICE_MEMORY)await page.addInitScript(value=>Object.defineProperty(navigator,'deviceMemory',{value}),Number(process.env.JALWEB_DEVICE_MEMORY));await page.goto(base);
 await page.waitForFunction(()=>!!window.jalwebDetached);
 const failures=await page.evaluate(async()=>{
  const {instructionList}=await import('/src/instruction-guide.ts');const {instructionUsage}=await import('/src/instruction-usage.ts');const failures=[];
  for(const op of instructionList){const {source}=instructionUsage(op);try{const c=await window.jalwebDetached.compileUsage(source);const errors=c.diagnostics.filter(d=>d.severity==='error');const targetLines=source.split('\n').flatMap((line,i)=>line.trim().split(/\s/)[0]===op?[i+1]:[]);const missing=targetLines.filter(line=>!c.stackFrames?.some(f=>f.line===line&&!f.unreachable));if(errors.length||!targetLines.length||missing.length)failures.push({op,errors,missing,frames:c.stackFrames?.length});}catch(e){failures.push({op,error:String(e)});}}
  return failures;
 });assert.deepEqual(failures,[]);
 await page.locator('#instructions-tab').click();const panel=page.locator('#instructions-panel');await panel.locator('.instruction-detail h2').waitFor();
 assert.equal(await panel.getByLabel('スタックの形式').count(),0);
 assert.deepEqual(await panel.locator('.frame-transition').first().locator('.frame-value code').allTextContents(),['b : int','a : int','a + b : int']);
 await panel.locator('.instruction-usage').scrollIntoViewIfNeeded();await panel.locator('.instruction-usage .view-line span').filter({hasText:/^iadd$/}).hover();
 const hover=page.locator('.stack-hover:visible');await hover.getByText('実行前',{exact:true}).waitFor();assert.equal(await hover.locator('.is-consumed').count(),2);assert.equal(await hover.locator('.is-produced').count(),1);await page.keyboard.press('Escape');
 await page.screenshot({path:'.cache/instruction-usage.png'});
 const search=panel.getByRole('searchbox');await search.fill('iinc');await panel.locator('.instruction-index [data-op="iinc"]').click();await panel.locator('.instruction-usage').scrollIntoViewIfNeeded();await panel.locator('.instruction-usage .view-line span').filter({hasText:/^iinc$/}).hover();await hover.getByText('ローカル変数',{exact:true}).waitFor();assert.match(await hover.textContent(),/#1/);await page.keyboard.press('Escape');
 const event=page.waitForEvent('popup');await page.locator('#instructions-tab').click({button:'right'});await page.locator('.panel-context-menu').getByText('小窓で開く',{exact:true}).click();const popup=await event;
 const workers=[];popup.on('worker',worker=>workers.push(worker.url()));await popup.route('**/runtime/**',route=>route.abort());
 await popup.locator('.instruction-detail h2').waitFor();const popupPanel=popup.locator('#instructions-panel');await popupPanel.getByRole('searchbox').fill('lshl');await popupPanel.locator('.instruction-index [data-op="lshl"]').click();
 await popupPanel.locator('.instruction-usage').scrollIntoViewIfNeeded();await popupPanel.locator('.instruction-usage .view-line span').filter({hasText:/^lshl$/}).hover();
 await popup.locator('.stack-hover:visible').getByText('実行前',{exact:true}).waitFor();assert.equal(workers.some(url=>url.includes('runtime.worker')),false);await popup.close();
});
