import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
test('parameter inlays update without a JVM and render in both windows without editing source',{timeout:60000},async t=>{
 const base='http://127.0.0.1:5214',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5214','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const context=await browser.newContext({viewport:{width:1400,height:950}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/runtime/**',route=>route.abort());await page.goto(base);
 const source='public class Main {\n public static calc(II)V { return }\n public mixed(JD[I)V { return }\n}';
 await page.evaluate(async source=>{const {editor}=await import('/src/main.ts');editor.setValue(source);},source);
 const labels=target=>target.locator('.view-line span').filter({hasText:/^\d+:$/});await labels(page).first().waitFor();assert.deepEqual(await labels(page).allTextContents(),['0:','1:','1:','3:','5:']);assert.equal(await page.evaluate(async()=>(await import('/src/main.ts')).editor.getValue()),source);
 const style=await labels(page).first().evaluate(n=>{const s=getComputedStyle(n);return {radius:s.borderRadius,font:s.fontFamily,bg:s.backgroundColor};});assert.notEqual(style.radius,'0px');assert.match(style.font,/Segoe UI/);assert.match(style.bg,/rgba/);
 await page.screenshot({path:'.cache/parameter-slots-dark.png'});
 await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');const model=editor.getModel();const line=model.getLineContent(2);editor.executeEdits('test',[{range:{startLineNumber:2,startColumn:line.indexOf('static')+1,endLineNumber:2,endColumn:line.indexOf('static')+8},text:''}]);});
 await page.waitForFunction(()=>[...document.querySelectorAll('.view-line span')].filter(n=>/^\d+:$/.test(n.textContent)).map(n=>n.textContent).join(',')==='1:,2:,1:,3:,5:');
 await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.trigger('test','undo',null);});await page.waitForFunction(()=>[...document.querySelectorAll('.view-line span')].filter(n=>/^\d+:$/.test(n.textContent))[0]?.textContent==='0:');
 await page.evaluate(async()=>(await import('/src/themes.ts')).applyTheme('vs',false));await page.screenshot({path:'.cache/parameter-slots-light.png'});
 const tab=await page.getByRole('tab',{name:'src/Main.jal',exact:true}).boundingBox(),event=page.waitForEvent('popup');await page.mouse.move(tab.x+tab.width/2,tab.y+tab.height/2);await page.mouse.down();await page.waitForTimeout(420);await page.mouse.move(1200,15,{steps:8});await page.mouse.up();const popup=await event;popup.on('pageerror',e=>errors.push(e.message));await labels(popup).first().waitFor();assert.deepEqual(await labels(popup).allTextContents(),['0:','1:','1:','3:','5:']);assert.equal(await popup.evaluate(async()=>(await import('/src/detached.ts')).editor.getValue()),source);await popup.close();assert.deepEqual(errors,[]);
});
