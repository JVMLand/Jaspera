import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
test('step over the entry return finishes without opening runtime definitions',{timeout:120000},async t=>{
 const base='http://127.0.0.1:5254';
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5254','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(60000);
 await page.addInitScript(()=>localStorage.setItem('jalweb.theme','vs-dark'));await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行できます');
 await page.evaluate(async()=>{window.testMain=await import('/src/main.ts');});
 await page.locator('#run').click();
 await page.waitForFunction(()=>document.querySelector('.debug-toolbar')?.dataset.state==='paused');
 await page.locator('.debug-toolbar [data-command=debug-over]').click();
 await page.waitForFunction(()=>{
  const {editor}=window.testMain;const marker=document.querySelector('.debug-current-marker');
  return marker&&editor.getModel().getLineContent(Number(marker.getAttribute('data-line'))).trim()==='return';
 });
 const uri=await page.evaluate(()=>window.testMain.editor.getModel().uri.toString());
 await page.locator('.debug-toolbar [data-command=debug-over]').click();
 await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行が完了しました');
 assert.equal(await page.evaluate(()=>window.testMain.editor.getModel().uri.toString()),uri);
 assert.equal(await page.getByRole('tab',{name:/PrintStream/}).count(),0);
 await page.locator('.debug-toolbar').waitFor({state:'hidden'});
 assert.equal(await page.locator('.debug-current-marker').count(),0);
});
