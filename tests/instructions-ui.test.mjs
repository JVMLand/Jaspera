import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from '@playwright/test';
test('Instructions dictionary works without JVM and across themes',{timeout:90000},async t=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5194','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());const base='http://127.0.0.1:5194';for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium'),headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/runtime/**',r=>r.abort());await page.goto(base);
 const tab=page.locator('#instructions-tab'),panel=page.locator('#instructions-panel');await tab.click();assert.equal(await panel.isVisible(),true);assert.equal(await page.locator('#console-panel').isVisible(),false);await panel.locator('h2').getByText('iadd',{exact:true}).waitFor();assert.deepEqual(await panel.locator('.frame-value code').allTextContents(),['3','2','5']);
 const headingSizes=await panel.evaluate(p=>['.instruction-detail>header h2','.instruction-advanced h3','.instruction-advanced h4'].map(q=>parseFloat(getComputedStyle(p.querySelector(q)).fontSize)));assert.ok(headingSizes[0]>headingSizes[1]&&headingSizes[1]>headingSizes[2],JSON.stringify(headingSizes));assert.doesNotMatch(await panel.locator('.instruction-summary').textContent(),/先に積んだ|左側|右側/);
 const original=await page.evaluate(async()=>(await import('/src/main.ts')).editor.getValue());
 const search=panel.getByRole('searchbox',{name:'命令を検索'}),category=panel.getByLabel('命令カテゴリ');
 await search.fill('invoke');
 await panel.locator('[data-op="invokevirtual"]').click();
 assert.equal(await panel.locator('.instruction-chooser').isVisible(),false);
 assert.equal(await search.getAttribute('aria-expanded'),'false');
 assert.equal(await panel.locator('.instruction-detail').evaluate(e=>e===document.activeElement),true);
 assert.equal(await panel.locator('h2').textContent(),'invokevirtual');
 await search.click();assert.equal(await panel.locator('.instruction-chooser').isVisible(),true);
 await panel.locator('[data-op="invokestatic"]').focus();
 assert.equal(await panel.locator('.instruction-chooser').isVisible(),true);
 await page.keyboard.press('Enter');
 assert.equal(await panel.locator('.instruction-chooser').isVisible(),false);
 assert.equal(await panel.locator('h2').textContent(),'invokestatic');
 await search.fill('iinc');await panel.locator('h2').getByText('iinc',{exact:true}).waitFor();assert.match(await panel.locator('.frame-transition').textContent(),/ローカル変数/);assert.deepEqual(await panel.locator('.frame-value code').allTextContents(),['3','4']);
 await search.fill('iload_1');await panel.locator('h2').getByText('iload_1',{exact:true}).waitFor();assert.equal(await panel.locator('.frame-transition h3').count(),1);
 await search.fill('dup2_x2');await panel.locator('h2').getByText('dup2_x2',{exact:true}).waitFor();await page.locator('#instructions-tab').click();await panel.getByLabel('スタックの形式').selectOption('3');assert.deepEqual(await panel.locator('.frame-value code').allTextContents(),['value1','value2','value1','value2','value1']);assert.match(await panel.locator('.frame-note').textContent(),/カテゴリ2/);
 assert.equal(await panel.locator('.instruction-advanced summary').count(),0);assert.doesNotMatch(await panel.locator('.instruction-advanced').textContent(),/Before:|After:|スタック効果/);assert.equal(await panel.locator('.instruction-advanced script').count(),0);
 await search.fill('not_an_opcode');assert.equal(await panel.locator('.instruction-detail').isVisible(),false);assert.match(await panel.locator('.instruction-index').textContent(),/該当する命令がありません/);
 await search.fill('');await category.selectOption('同期');assert.deepEqual(await panel.locator('.instruction-buttons button').allTextContents(),['monitorenter','monitorexit']);await category.selectOption('');await search.fill('iadd');await page.locator('#instructions-tab').click();
 for(const theme of ['jal-night','darcula','japan-light','japan-dark','hitachi-light','hitachi-dark','denden-light','denden-night']){
  await page.evaluate(async id=>(await import('/src/themes.ts')).applyTheme(id,false),theme);await page.waitForTimeout(80);
  const bounds=await panel.locator('.instruction-detail').boundingBox();assert.ok(bounds.height>100,theme+JSON.stringify(bounds));assert.ok(bounds.width>200,theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),theme);await page.screenshot({path:'.cache/instructions-'+theme+'.png'});
 }
 await tab.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#console-tab').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#console-panel').isVisible(),true);await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#problems-panel').isVisible(),true);await page.keyboard.press('ArrowRight');assert.equal(await panel.isVisible(),true);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'.cache/instructions-mobile.png'});assert.equal(await page.evaluate(async()=>(await import('/src/main.ts')).editor.getValue()),original);assert.deepEqual(errors,[]);
});
