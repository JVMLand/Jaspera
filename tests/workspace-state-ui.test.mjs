import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
test('detached console receives output, input, diagnostics and theme changes from workspace commands',{timeout:90000},async t=>{
 const base='http://127.0.0.1:5209',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5209','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext(),errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行できます',null,{timeout:60000});
 await page.locator('#stdin').fill('from main');
 const event=page.waitForEvent('popup');await page.locator('#console-tab').click({button:'right'});await page.getByRole('menuitem',{name:'小窓で開く',exact:true}).click();const popup=await event;await popup.locator('#popup-stdin').waitFor();assert.equal(await popup.locator('#popup-stdin').inputValue(),'from main');
 await popup.locator('#popup-stdin').fill('from popup');assert.equal(await page.locator('#stdin').inputValue(),'from popup');
 await popup.locator('#menu-build').click();await popup.locator('#menu-run').click();await popup.waitForFunction(()=>document.querySelector('#popup-output')?.textContent==='Hello, World!\n',null,{timeout:30000});await popup.waitForFunction(()=>document.querySelector('#status')?.textContent==='実行が完了しました');
 assert.equal(await page.locator('#output').textContent(),'Hello, World!\n');await popup.locator('#popup-clear').click();await page.waitForFunction(()=>document.querySelector('#output')?.textContent==='');assert.equal(await popup.locator('#popup-output').textContent(),'');
 await page.evaluate(async()=>{const {applyTheme}=await import('/src/themes.ts');applyTheme('googol-light');});await popup.waitForFunction(()=>document.documentElement.dataset.theme==='googol-light');
 await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.setValue('public class Main {\n public static main([Ljava/lang/String;)V {\n bipush 1\n pop\n return\n }\n}');});
 await popup.locator('#menu-view').click();await popup.locator('#show-problems').click();await popup.getByRole('button').filter({hasText:'iconst_1'}).waitFor();
 await popup.close();assert.deepEqual(errors,[]);
});
