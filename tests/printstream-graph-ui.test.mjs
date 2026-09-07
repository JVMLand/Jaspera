import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {readFile} from 'node:fs/promises';import {unzipSync} from 'fflate';import {chromium} from '@playwright/test';
test('bundled PrintStream and System disassemble and graphs without receiver errors or drag selection',{timeout:240000},async t=>{
 const base='http://127.0.0.1:5226',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5226','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行できます');
 for(const [name,methods,nodes] of [['PrintStream',71,1322],['System',39,849]]){
 const entry='java/'+(name==='System'?'lang':'io')+'/'+name+'.class';
 const bytes=unzipSync(await readFile('public/runtime/jdk23.jar'),{filter:file=>file.name===entry})[entry];assert.ok(bytes);
 await page.evaluate(({bytes,name})=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],name+'.class'));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},{bytes:Array.from(bytes),name});
 await page.waitForFunction(()=>document.querySelector('#state')?.textContent.includes('逆アセンブルしました'));await page.locator('#graph-tab').click();await page.waitForFunction(({methods,nodes})=>document.querySelectorAll('.graph-method').length===methods&&document.querySelectorAll('.graph-node').length===nodes,{methods,nodes});
 assert.equal(await page.locator('.graph-node text').first().evaluate(el=>getComputedStyle(el).userSelect),'none');
 const box=await page.locator('.graph-canvas').boundingBox();const before=await page.locator('.graph-canvas>g').getAttribute('transform');await page.evaluate(()=>getSelection()?.removeAllRanges());await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+40,{steps:8});await page.mouse.up();assert.equal(await page.evaluate(()=>getSelection()?.toString()),'');assert.notEqual(await page.locator('.graph-canvas>g').getAttribute('transform'),before);assert.deepEqual(errors,[]);
 }
});
