import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readdir,stat} from 'node:fs/promises';
// Run after npm run build, without other tests or builds running.
await mkdir('.cache',{recursive:true});
const reportPath=process.argv[2]??'.cache/performance-report.json';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5222','--strictPort'],{stdio:'pipe',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5222')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});const runs=[];
 for(let i=0;i<3;i++){
  const context=await browser.newContext();const page=await context.newPage();const workers=[];page.on('worker',w=>workers.push(w.url().split('/').at(-1)));
  await page.addInitScript(()=>{window.longTasks=[];new PerformanceObserver(list=>window.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});});
  const start=performance.now();await page.goto('http://127.0.0.1:5222');await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行できます',{},{timeout:60000});
  const readyMs=performance.now()-start;await page.waitForTimeout(300);const hiddenGraph={visible:await page.locator('#graph-panel').isVisible(),nodes:await page.locator('.graph-node').count(),workers:[...workers]};
  const execute=[];for(let n=0;n<2;n++){const t=performance.now();await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行が完了しました',{},{timeout:60000});execute.push(performance.now()-t);}
  const compile=await page.evaluate(async()=>{const result=[];for(const n of [20,200,1000]){const source='public class Bench'+n+' { public static main([Ljava/lang/String;)V {\n'+'nop\n'.repeat(n)+'return\n}}';const t=performance.now();const c=await window.jalwebDetached.compileUsage(source);const elapsed=performance.now()-t;const cachedAt=performance.now();await window.jalwebDetached.compileUsage(source);result.push({instructions:n+1,ms:elapsed,cachedMs:performance.now()-cachedAt,jsonBytes:new TextEncoder().encode(JSON.stringify(c)).length,errors:c.diagnostics.filter(d=>d.severity==='error').length});}return result;});
  console.log(`Measurement ${i+1}/3 complete`);runs.push({readyMs,hiddenGraph,execute,compile,longTasks:await page.evaluate(()=>({count:window.longTasks.length,totalMs:window.longTasks.reduce((s,e)=>s+e.duration,0),maxMs:Math.max(0,...window.longTasks.map(e=>e.duration))}))});await context.close();
 }
 const assets=[];for(const name of await readdir('dist/assets'))if(/\.js$/.test(name))assets.push({name,bytes:(await stat('dist/assets/'+name)).size});
 const report={environment:'Edge headless; local production preview; 3 fresh browser contexts; localhost, not real network; synthetic nop methods',runs,assets:assets.sort((a,b)=>b.bytes-a.bytes).slice(0,6)};await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.kill();}
