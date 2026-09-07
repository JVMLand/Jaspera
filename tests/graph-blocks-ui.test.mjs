import test from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from '@playwright/test';
test('label blocks render with shared exception arrows and survive filtering',{timeout:60000},async t=>{
 const source=`public class Guarded { public static main()V {
 Start: [~End, java/lang/IllegalArgumentException: Handler, java/lang/ArithmeticException: Handler]
 nop
 iconst_1
 pop
 Middle:
 nop
 End:
 return
 Handler:
 pop
 return
 } }`;
 await mkdir('.cache/graph',{recursive:true});await writeFile('.cache/graph/Guarded.jal',source);const run=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge','.cache/graph/Guarded.jal'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);const compilation=JSON.parse(run.stdout);assert.ok(compilation.bytecode,JSON.stringify(compilation.diagnostics));const graph=compilation.graphs[0];assert.equal(new Set(graph.nodes.map(n=>n.block)).size,4);assert.equal(graph.edges.filter(e=>e.kind==='exception').length,2);assert.ok(graph.edges.filter(e=>e.kind==='exception').every(e=>e.label==='IllegalArgumentException\nArithmeticException'));
 const base='http://127.0.0.1:5237',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5237','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1300,height:1200}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/tests/harness.html');
 await page.evaluate(async({source,compilation})=>{const {installInstructionGraph}=await import('/src/instruction-graph.ts');const host=document.createElement('div');host.style.cssText='width:1100px;height:1100px';document.body.append(host);window.panel=installInstructionGraph(host,async()=>compilation,(_,line)=>window.line=line);window.panel.update({uri:'inmemory://jal/Guarded.jal',source,version:1,line:3,column:1});},{source,compilation});
 const complete=()=>page.waitForFunction(()=>document.querySelector('.graph-status')?.textContent.includes(' · 100% · '));await complete();await page.locator('.graph-label-block').first().waitFor();assert.equal(await page.locator('.graph-label-block').count(),4);assert.equal(await page.locator('.graph-edge.exception').count(),2);assert.equal(await page.locator('.graph-node').count(),graph.nodes.length);
 const labels=await page.locator('.graph-edge-label').evaluateAll(nodes=>nodes.map(node=>[...node.querySelectorAll('tspan')].map(span=>({text:span.textContent,y:Number(span.getAttribute('y'))}))).filter(lines=>lines.length===2));assert.equal(labels.length,2);for(const lines of labels){assert.deepEqual(lines.map(l=>l.text),['IllegalArgumentException','ArithmeticException']);assert.equal(lines[1].y-lines[0].y,14);}
 await page.screenshot({path:'.cache/graph-blocks.png'});
 await page.locator('[data-kind="exception"] input').uncheck();await complete();await page.waitForFunction(()=>!document.querySelector('.graph-edge.exception'));assert.equal(await page.locator('.graph-label-block').count(),4);
 await page.locator('[data-kind="exception"] input').check();await complete();await page.waitForFunction(()=>document.querySelectorAll('.graph-edge.exception').length===2);await page.locator('.graph-node rect').first().click();assert.equal(await page.evaluate(()=>window.line),3);assert.deepEqual(errors,[]);await page.evaluate(()=>window.panel.dispose());
});
