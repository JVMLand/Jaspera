import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
test('Open routes source, class and project files and works in detached windows',{timeout:120000},async t=>{
 await mkdir('.cache/open-files',{recursive:true});await writeFile('.cache/open-files/Opened.jal',`public class Opened (major_version=67, minor_version=0) {
 public static value()I {
 iconst_1
 ireturn
 }
}`);
 const compiled=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge','.cache/open-files/Opened.jal'],{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);const bytecode=JSON.parse(compiled.stdout).bytecode;assert.ok(bytecode,compiled.stdout);
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5211','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());const base='http://127.0.0.1:5211';for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium',headless:true});t.after(()=>browser.close());const context=await browser.newContext({viewport:{width:1400,height:900}}),errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));const page=await context.newPage();await page.goto(base);
 const open=async(target,name,buffer)=>{const event=target.waitForEvent('filechooser');await target.locator('#menu-file').click();await target.locator('#open-files').click();await (await event).setFiles({name,mimeType:'application/octet-stream',buffer:Buffer.from(buffer)});};
 assert.equal(await page.locator('#open-class,#open-project-file').count(),0);
 await open(page,'Helper.JAL','public class Helper {}');await page.getByRole('tab',{name:'src/Helper.jal',exact:true}).waitFor();assert.equal(await page.evaluate(async()=>(await import('/src/main.ts')).editor.getValue()),'public class Helper {}');
 await open(page,'Helper.jal','public class Other {}');await page.getByRole('heading',{name:'同じ名前のファイルがあります'}).waitFor();await page.locator('#dialog-cancel').click();assert.equal(await page.evaluate(async()=>(await import('/src/main.ts')).editor.getValue()),'public class Helper {}');
 await open(page,'Opened.CLASS',Buffer.from(bytecode,'base64'));await page.getByRole('tab',{name:'Opened.CLASS (JAL)',exact:true}).waitFor({timeout:60000});assert.equal(await page.evaluate(async()=>(await import('/src/main.ts')).editor.getRawOptions().readOnly),true);
 await page.locator('#menu-edit').click();assert.equal(await page.locator('#comment').isDisabled(),true);assert.equal(await page.locator('#find').isDisabled(),false);await page.keyboard.press('Escape');
 await page.locator('#menu-view').click();await page.locator('#theme-settings').click();await page.locator('#theme-dialog[open]').waitFor();await page.keyboard.press('Escape');
 const event=page.waitForEvent('popup');await page.locator('#instructions-tab').click({button:'right'});await page.getByRole('menuitem',{name:'小窓で開く',exact:true}).click();const popup=await event;await open(popup,'Popup.jal','public class Popup {}');await popup.getByRole('tab',{name:'src/Popup.jal',exact:true}).waitFor();assert.equal(await popup.evaluate(async()=>(await import('/src/detached.ts')).editor.getValue()),'public class Popup {}');
 const chooser=popup.waitForEvent('filechooser');await popup.keyboard.press('Control+o');await (await chooser).setFiles([]);await popup.close();
 // Selecting a .jalprj asks for its containing directory, then restores the sources.
 const disk=await context.newPage();await disk.addInitScript(()=>{window.showDirectoryPicker=async()=>{const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('open-project-test',{create:true});const src=await root.getDirectoryHandle('src',{create:true});for(const [dir,name,text] of [[root,'demo.jalprj',JSON.stringify({format:'jalprj',version:1,name:'Disk',entryFile:'src/Main.jal'})],[src,'Main.jal','public class Main {}']]){const writer=await (await dir.getFileHandle(name,{create:true})).createWritable();await writer.write(text);await writer.close();}return root;};});await disk.goto(base);
 await open(disk,'demo.jalprj',JSON.stringify({format:'jalprj',version:1,name:'Disk',entryFile:'src/Main.jal'}));await disk.getByRole('button',{name:'フォルダーを選ぶ',exact:true}).click();await disk.waitForFunction(()=>document.querySelector('#project-name')?.textContent==='Disk');assert.equal(await disk.evaluate(async()=>(await import('/src/main.ts')).editor.getValue()),'public class Main {}');assert.equal(await disk.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
});
