import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {chromium} from '@playwright/test';
test('Monaco and dictionary share themed instruction colors',{timeout:60000},async t=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5195','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());const base='http://127.0.0.1:5195';for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium'),headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/runtime/**',r=>r.abort());await page.goto(base);await page.locator('#instructions-tab').click();
 const result=await page.evaluate(async()=>{
  const monaco=await import('/tests/monaco-probe.ts'),colors=await import('/src/instruction-colors.ts'),{editor}=await import('/src/main.ts');
  const failures=[];for(const [group,ops] of Object.entries(colors.instructionHighlightGroups))for(const op of ops){const token=monaco.editor.tokenize(op,'jal')[0][0];if(token.type!=='keyword.instruction.'+group.replaceAll('_','-')+'.jal')failures.push([op,token.type]);}
  for(const line of ['// iadd invokevirtual','"iadd invokevirtual"','/* iadd invokevirtual */'])if(monaco.editor.tokenize(line,'jal')[0].some(t=>t.type.startsWith('keyword.instruction')))failures.push(line);
  editor.setValue(Object.values(colors.instructionHighlightGroups).map(ops=>ops[0]).join('\n'));return failures;
 });assert.deepEqual(result,[]);
 const ids=await page.evaluate(async()=>(await import('/src/themes.ts')).themes.map(t=>t.id));
 for(const id of ids){await page.evaluate(async id=>(await import('/src/themes.ts')).applyTheme(id,false),id);await page.waitForTimeout(150);await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.layout();editor.revealLineInCenter(12,1);editor.render(true);});await page.waitForTimeout(80);
  const check=await page.evaluate(async()=>{const {instructionColors}=await import('/src/instruction-colors.ts');const expected=instructionColors(document.documentElement.dataset.theme);const rgb=hex=>'rgb('+[0,2,4].map(n=>parseInt(hex.slice(n,n+2),16)).join(', ')+')';const node=[...document.querySelectorAll('.view-line span:not(:has(span))')].find(n=>n.textContent==='getfield');const heading=document.querySelector('.instruction-detail h2');return {actual:node&&getComputedStyle(node).color,expected:rgb(expected.field_access),heading:getComputedStyle(heading).color,headingExpected:rgb(expected.value_calculations)};});assert.equal(check.actual,check.expected,id);assert.equal(check.heading,check.headingExpected,id);
  if(['darcula','japan-light','denden-night'].includes(id))await page.screenshot({path:'.cache/instruction-colors-'+id+'.png'});
 }
 assert.deepEqual(errors,[]);
});
