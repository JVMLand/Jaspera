import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from '@playwright/test';
test('offset gutter updates without loading or compiling in the JVM',{timeout:40000},async t=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5182','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 const base='http://127.0.0.1:5182';for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium'),headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/runtime/**',route=>route.abort());await page.goto(base);
 const values=()=>page.locator('.jal-bytecode-offset').evaluateAll(es=>es.map(e=>e.textContent).filter(Boolean));
 await page.waitForFunction(()=>[...document.querySelectorAll('.jal-bytecode-offset')].some(e=>e.textContent==='8'));assert.deepEqual(await values(),['0','3','5','8']);
 await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.setValue('public class Test {\n public static a()V {\n  nop\n  sipush 300\n  return\n }\n public static b()V {\n  return\n }\n}');});
 await page.waitForFunction(()=>[...document.querySelectorAll('.jal-bytecode-offset')].some(e=>e.textContent==='4'));assert.deepEqual(await values(),['0','1','4','0']);
 assert.match(await page.locator('.jal-bytecode-offset').filter({hasText:'4'}).getAttribute('title'),/命令解析/);
 const fonts=await page.evaluate(()=>({line:getComputedStyle(document.querySelector('.jal-source-line')).fontSize,offset:getComputedStyle(document.querySelector('.jal-bytecode-offset')).fontSize}));assert.equal(fonts.offset,fonts.line);
 await page.screenshot({path:'.cache/offset-gutter.png'});assert.deepEqual(errors,[]);
});
