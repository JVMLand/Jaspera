import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from '@playwright/test';
test('close tabs, reopen edited source, and Alt-click to close others',{timeout:45000},async t=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5187','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 const base='http://127.0.0.1:5187';for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium'),headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/runtime/**',route=>route.abort());await page.goto(base);
 await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.executeEdits('test',[{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1},text:'// unsaved\n'}]);});
 for(const path of ['src/A.jal','src/B.jal']){await page.locator('#add-file').click();await page.locator('#dialog-input').fill(path);await page.locator('#dialog-ok').click();await page.getByRole('tab',{name:path,exact:true}).waitFor();}
 const sourceFolder=page.locator('#file-list summary[title="src"]'),mainFile=page.locator('#file-list button[title="src/Main.jal"]');
 assert.equal(await sourceFolder.textContent(),'src');assert.equal(await mainFile.textContent(),'Main.jal');await sourceFolder.click();assert.equal(await mainFile.isVisible(),false);
 await page.getByRole('tab',{name:'src/A.jal',exact:true}).click();assert.equal(await mainFile.isVisible(),false);await sourceFolder.click();assert.equal(await mainFile.isVisible(),true);
 await page.getByRole('button',{name:'src/Main.jal のタブを閉じる',exact:true}).click();assert.equal(await page.locator('#file-tabs [role=tab]').count(),2);assert.equal(await page.locator('#file-list button').count(),3);
 await page.locator('#file-list button[title="src/Main.jal"]').click();assert.match(await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');return editor.getValue();}),/^\/\/ unsaved/);
 await page.getByRole('tab',{name:'src/A.jal',exact:true}).click({modifiers:['Alt']});assert.equal(await page.locator('#file-tabs [role=tab]').count(),1);assert.equal(await page.locator('#file-tabs [aria-selected=true]').textContent(),'src/A.jal');
 await page.locator('#file-list button[title="src/B.jal"]').click();await page.getByRole('button',{name:'src/A.jal のタブを閉じる',exact:true}).click({modifiers:['Alt']});assert.equal(await page.locator('#file-tabs [role=tab]').count(),1);assert.equal(await page.locator('#file-tabs [aria-selected=true]').textContent(),'src/A.jal');
 await page.getByRole('button',{name:'src/A.jal のタブを閉じる',exact:true}).click();assert.equal(await page.locator('#file-tabs [role=tab]').count(),0);assert.equal(await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');return editor.getModel()===null;}),true);
 await page.locator('#file-list button[title="src/Main.jal"]').click();assert.match(await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');return editor.getValue();}),/^\/\/ unsaved/);
 await page.locator('#file-list button[title="src/B.jal"]').click();await page.getByRole('tab',{name:'src/B.jal',exact:true}).press('ArrowLeft');assert.equal(await page.locator('#file-tabs [aria-selected=true]').textContent(),'src/Main.jal');
 await page.screenshot({path:'.cache/editor-tab-close.png'});assert.deepEqual(errors,[]);
});
