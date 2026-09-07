import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from '@playwright/test';
test('Debug pane, gutter breakpoints and detached controls share the running VM',{timeout:150000},async t=>{
 const base='http://127.0.0.1:5252',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5252','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium'),headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);await page.addInitScript(()=>localStorage.setItem('jalweb.theme','vs-dark'));await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行できます');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行できます');await page.locator('#instructions-tab').click();
 await page.getByRole('tab',{name:'Main',exact:true}).click();
 await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');const offset=editor.getValue().indexOf('->out')+3;editor.setPosition(editor.getModel().getPositionAt(offset));editor.focus();});
 await page.keyboard.press('F12');await page.waitForFunction(async()=>(await import('/src/main.ts')).editor.getModel()?.uri.authority==='definition');
 await page.getByRole('tab',{name:'Main',exact:true}).click();
 await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.setValue(`public class Main {
 public static main([Ljava/lang/String;)V {
 iconst_2
 iconst_3
 iadd
 istore_1
 return
 }
}`);editor.setPosition({lineNumber:6,column:1});editor.focus();await editor.getAction('jaspera.toggleBreakpoint').run();});
 await page.locator('.debug-breakpoint').waitFor();assert.equal(await page.locator('.debug-breakpoint').count(),1);
 await page.locator('#menu-debug').click();await page.locator('#debug-start').click();
 await page.waitForFunction(()=>document.querySelector('.debug-status')?.textContent.startsWith('停止中'));
 await page.locator('.debug-current-line').waitFor();assert.equal(await page.locator('.debug-current-line').count(),1);
 await page.locator('#debug-panel [data-command=debug-continue]').click();
 await page.waitForFunction(()=>document.querySelector('#state')?.textContent.includes(' · 3 で停止中'));
 assert.match(await page.locator('.debug-values').innerText(),/5/);
 await page.screenshot({path:'.cache/debugger-ui.png'});
 const popupEvent=page.waitForEvent('popup');
 await page.locator('#debug-tab').click({button:'right'});await page.getByRole('menuitem',{name:'小窓で開く',exact:true}).click();
 const popup=await popupEvent;popup.setDefaultTimeout(60000);await popup.waitForLoadState();await popup.locator('#debug-panel [data-command=debug-over]').waitFor();
 await popup.locator('#debug-panel [data-command=debug-over]').click();
 await popup.waitForFunction(()=>document.querySelector('.debug-values')?.textContent.includes('#1'));
 assert.match(await popup.locator('.debug-values').innerText(),/5/);
 await popup.locator('#debug-panel [data-command=debug-continue]').click();await popup.waitForFunction(()=>document.querySelector('.debug-status')?.textContent==='実行が終了しました。');
 assert.deepEqual(errors,[]);
});
