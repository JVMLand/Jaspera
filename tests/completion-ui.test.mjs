import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
test('Monaco automatically suggests operands and expands Java-style print aliases',{timeout:120000},async t=>{
 const base='http://127.0.0.1:5180';const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5180','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await chromium.launch({channel:process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium'),headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('#state').textContent==='実行できます',null,{timeout:60000});
 async function start(){await page.keyboard.press('Escape');await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.setValue('public class Test {\n  public static main([Ljava/lang/String;)V {\n    \n    return\n  }\n}');editor.setPosition({lineNumber:3,column:5});editor.focus();});}
 async function type(text){await start();await page.keyboard.type(text,{delay:20});}
 async function choose(text){const row=page.locator('.suggest-widget.visible .monaco-list-row').filter({hasText:text}).first();await row.waitFor({state:'visible',timeout:15000});await row.click();await page.keyboard.press('Escape');}
 const source=()=>page.evaluate(async()=>{const {editor}=await import('/src/main.ts');return editor.getValue();});
 await t.test('getstatic without a space automatically offers fields',async()=>{
  await type('getstatic');await choose('java/lang/System->out:Ljava/io/PrintStream;');assert.match(await source(),/    getstatic java\/lang\/System->out:Ljava\/io\/PrintStream;/);assert.equal((await source()).includes('getstatic getstatic'),false);
 });
 await t.test('dot-qualified and short member names replace the whole operand',async()=>{
  for(const typed of ['getstatic java.lang.System.out','getstatic System.out']) {
   await type(typed);await page.keyboard.press('Control+Space');await choose('java/lang/System->out:Ljava/io/PrintStream;');assert.match(await source(),/getstatic java\/lang\/System->out:Ljava\/io\/PrintStream;/);assert.equal((await source()).includes(typed),false);
  }
  for(const typed of ['invokevirtual print','invokevirtual System.out.println']) {
   await type(typed);await page.keyboard.press('Control+Space');await choose('java/io/PrintStream->println(Ljava/lang/String;)V');assert.match(await source(),/invokevirtual java\/io\/PrintStream->println\(Ljava\/lang\/String;\)V/);
  }
 });
 await t.test('print and fully qualified aliases insert runnable JAL',async()=>{
  for(const typed of ['print','System.out.println','java.lang.System.out.println']) {
   await type(typed);await page.keyboard.press('Control+Space');await choose('System.out.println');const result=await source();assert.match(result,/getstatic java\/lang\/System->out:/);assert.match(result,/ldc "Hello, World!"/);assert.match(result,/invokevirtual java\/io\/PrintStream->println/);
  }
  await page.locator('#run').click();await page.waitForFunction(()=>/実行が完了|実行に失敗|コンパイルエラー/.test(document.querySelector('#state').textContent),null,{timeout:30000});assert.equal(await page.locator('#state').textContent(),'実行が完了しました',await page.locator('#problems').textContent());assert.equal(await page.locator('#output').textContent(),'Hello, World!\n');
 });
 assert.deepEqual(errors,[]);
});
