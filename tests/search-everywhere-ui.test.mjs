import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
test('double Shift searches files and OpenJDK definitions; chords do not open it',{timeout:150000},async t=>{
 const base='http://127.0.0.1:5231',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5231','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('jalweb.theme','vs-dark'));const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#editor .monaco-editor').waitFor();
 const dialog=page.getByRole('dialog',{name:'どこでも検索'}),input=dialog.getByRole('combobox');
 await page.keyboard.press('Shift+A');await page.keyboard.press('Shift');assert.equal(await dialog.isVisible(),false);await page.keyboard.press('Escape');
 const show=async()=>{await page.keyboard.press('Shift');await page.keyboard.press('Shift');await dialog.waitFor();};
 await show();await input.fill('Main.jal');await dialog.getByRole('option').filter({hasText:'Main.jal'}).first().waitFor();await input.press('Enter');await dialog.waitFor({state:'hidden'});
 await show();await input.fill('java.lang.System out');const result=dialog.getByRole('option').filter({hasText:'out:Ljava/io/PrintStream;'});await result.first().waitFor();await result.first().click();await dialog.waitFor({state:'hidden',timeout:90000});
 const text=await page.evaluate(async()=>{const m=await import('/src/editor-platform.ts');const editor=m.editor.getEditors().find(e=>e.hasTextFocus());return {path:editor.getModel().uri.path,line:editor.getModel().getLineContent(editor.getPosition().lineNumber)};});assert.match(text.path,/java\/lang\/System/);assert.match(text.line,/out/);
 await show();await input.fill('PrintStream');await dialog.getByRole('option').first().waitFor();await input.press('Escape');await dialog.waitFor({state:'hidden'});const popupEvent=page.waitForEvent('popup');await page.locator('#instructions-tab').click({button:'right'});await page.locator('.panel-context-menu').getByText('小窓で開く',{exact:true}).click();const popup=await popupEvent;await popup.locator('#menus').waitFor();await popup.keyboard.press('Shift');await popup.keyboard.press('Shift');const pd=popup.getByRole('dialog',{name:'どこでも検索'});await pd.waitFor();await pd.getByRole('combobox').fill('java.lang.System out');await pd.getByRole('option').filter({hasText:'out:Ljava/io/PrintStream;'}).first().click();await pd.waitFor({state:'hidden'});assert.ok(await popup.locator('#editor').innerText());await popup.close();assert.deepEqual(errors,[]);
});
