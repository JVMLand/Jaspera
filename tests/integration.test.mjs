import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const base=process.env.JALWEB_TEST_URL??'http://127.0.0.1:5178';
const channel=process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium');
const hello=await readFile('tests/fixtures/HelloWorld.jal','utf8');
function program(body,extra='') {return `public class Test {public static main([Ljava/lang/String;)V {${body}\nreturn\n}\n${extra}\n}`;}
test('JALWeb browser / real WebAssembly integration', {timeout:240000}, async t=>{
 if(!process.env.JALWEB_TEST_URL) {
   const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5178','--strictPort'],{stdio:'pipe',windowsHide:true});
   t.after(()=>server.kill());
   let ready=false;
   for(let i=0;i<100;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
   assert.ok(ready,'Test dev server did not start');
 }
 const browser=await chromium.launch({channel,headless:true});
 t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.goto(`${base}/tests/harness.html`);
 await page.evaluate(async()=>{const {Runtime}=await import('/src/runtime.ts');globalThis.compiler=new Runtime();globalThis.Runtime=Runtime;});
 const compile=source=>page.evaluate(source=>globalThis.compiler.compile(source),source);
 const run=(compilation,stdin='')=>page.evaluate(async({compilation,stdin})=>{
   const runtime=new globalThis.Runtime();let stdout='',stderr='';
   runtime.onOutput=(stream,text)=>{if(stream==='stdout')stdout+=text;else stderr+=text;};
   try {await runtime.run(compilation,stdin);return {stdout,stderr};}
   catch(error){throw new Error(error.message+'\n'+stderr);}
   finally {runtime.stop();}
 },{compilation,stdin});
 await t.test('Hello World compiles to JVM classfile and runs in WASM',async()=>{
   const result=await compile(hello);assert.equal(result.diagnostics.filter(d=>d.severity==='error').length,0,JSON.stringify(result));
   assert.equal(Buffer.from(result.bytecode,'base64').subarray(0,4).toString('hex'),'cafebabe');
   assert.equal((await run(result)).stdout,'Hello, World!\n');
 });
 await t.test('Unicode source and stdout retain Japanese and supplementary characters',async()=>{
   const result=await compile(hello.replaceAll('Hello, World!','こんにちは 🌏 café'));assert.ok(result.bytecode,JSON.stringify(result));
   assert.equal((await run(result)).stdout,'こんにちは 🌏 café\n');
 });
 for(const [name,source] of [
   ['syntax',program('ldc')],['lexer',program('@')],['stack underflow',program('pop')],
   ['stack type',program('iconst_1\nastore_1')],['unknown label',program('goto missing')],
   ['wide stack category',program('lconst_0\ndup\npop2\npop2')],
   ['branch stack merge',program('iconst_0\nifeq other\niconst_1\ngoto end\nother:\nfconst_1\nend:\npop')]
 ]) await t.test(`diagnostic: ${name}`,async()=>{
   const result=await compile(source);assert.equal(result.bytecode,'');assert.ok(result.diagnostics.some(d=>d.severity==='error'),JSON.stringify(result));
   assert.ok(result.diagnostics.every(d=>d.line>=1&&d.column>=1));
 });
 for(const name of ['ArraysAndLoops','FizzBuzz','SwitchExample','ObjectAndStringBuilder','TryCatchFinally','DefineExample','MultiLineDefine']) {
   await t.test(`upstream JAL example: ${name}`,async()=>{
     const source=await readFile(`tests/fixtures/${name}.jal`,'utf8');
     const result=await compile(source);assert.ok(result.bytecode,JSON.stringify(result.diagnostics));
     const output=await run(result);assert.equal(output.stderr,'');assert.ok(output.stdout.length>0);
   });
 }
 await t.test('standard input is available to java.io',async()=>{
   const source=program('getstatic java/lang/System->out:Ljava/io/PrintStream;\ngetstatic java/lang/System->in:Ljava/io/InputStream;\ninvokevirtual java/io/InputStream->read()I\ninvokevirtual java/io/PrintStream->println(I)V');
   const result=await compile(source);assert.ok(result.bytecode,JSON.stringify(result.diagnostics));assert.equal((await run(result,'A')).stdout,'65\n');
 });
 await t.test('OpenJDK standard library package coverage',async()=>{
   await mkdir('java/build/probes',{recursive:true});
   const build=spawnSync('javac',['--release','21','-encoding','UTF-8','-d','java/build/probes','tests/StandardLibraryProbe.java'],{encoding:'utf8'});
   assert.equal(build.status,0,build.stderr);
   const bytecode=(await readFile('java/build/probes/StandardLibraryProbe.class')).toString('base64');
   const output=await run({className:'StandardLibraryProbe',bytecode,diagnostics:[]});
   console.log(output.stdout);assert.doesNotMatch(output.stdout,/FAIL/);assert.equal((output.stdout.match(/PASS/g)??[]).length,13);
 });
 await t.test('ZIP / GZIP, small buffers, flush, dictionary, reset and ByteBuffer adapters',async()=>{
   const build=spawnSync('javac',['--release','21','-d','java/build/probes','tests/CompressionProbe.java'],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
   const bytecode=(await readFile('java/build/probes/CompressionProbe.class')).toString('base64');
   const result=await run({className:'CompressionProbe',bytecode,diagnostics:[]});
   assert.match(result.stdout,/PASS compression/);
   const encoded=result.stdout.match(/GZIP ([A-Za-z0-9+/=]+)/)[1];
   const expected=Buffer.from(Array.from({length:8192},(_,i)=>i%251));
   assert.deepEqual(gunzipSync(Buffer.from(encoded,'base64')),expected);
 });
 await t.test('runtime exception is visible and the next execution is isolated',async()=>{
   const bad=await compile(program('iconst_1\niconst_0\nidiv\npop'));
   assert.ok(bad.bytecode,JSON.stringify(bad.diagnostics));
   await assert.rejects(()=>run(bad),/ArithmeticException/);
   assert.equal((await run(await compile(hello))).stdout,'Hello, World!\n');
 });
 await t.test('stopping an infinite loop terminates its Worker and permits reuse',async()=>{
   const loop=await compile(program('loop:\ngoto loop'));
   assert.ok(loop.bytecode,JSON.stringify(loop.diagnostics));
   const result=await page.evaluate(async compilation=>{
     const runtime=new globalThis.Runtime();
     const task=runtime.run(compilation,'').then(()=>false,error=>error.message.includes('停止'));
     setTimeout(()=>runtime.stop(),5000);
     return task;
   },loop);
   assert.equal(result,true);
   assert.equal((await run(await compile(hello))).stdout,'Hello, World!\n');
 });
 await t.test('Monaco UI: default source, Run and diagnostics',async()=>{
   await page.goto(base);
   await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行できます',{},{timeout:60000});
   await page.locator('#run').click();
   await page.waitForFunction(()=>document.querySelector('#state')?.textContent==='実行が完了しました',{},{timeout:30000});
   assert.equal(await page.locator('#output').textContent(),'Hello, World!\n');
   await page.locator('.monaco-editor textarea').focus();
   await page.keyboard.press('ControlOrMeta+A');
   await page.keyboard.insertText('public class Test {public static main([Ljava/lang/String;)V {pop\nreturn}}');
   await page.waitForFunction(()=>Number(document.querySelector('#problem-count')?.textContent)>0);
   assert.ok((await page.locator('#problems').textContent()).length>0);

   async function edit(source){await page.evaluate(async source=>{const {editor}=await import('/src/main.ts');editor.setValue(source);editor.focus();},source);}
   await edit('public class Test {\n  public static main([Ljava/lang/String;)V {\n    invo\n  }\n}');
   await page.keyboard.press('ControlOrMeta+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');
   await page.keyboard.press('Control+Space');
   await page.waitForFunction(()=>document.querySelector('.suggest-widget.visible')?.textContent?.includes('invokevirtual'));
   await page.keyboard.press('Escape');
   await edit('public class Test {\n  public static main([Ljava/lang/String;)V {\n    getstatic java/lang/System->o\n  }\n}');
   await page.keyboard.press('ControlOrMeta+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Control+Space');
   await page.waitForFunction(()=>document.querySelector('.suggest-widget.visible')?.textContent?.includes('out:Ljava/io/PrintStream;'));
   await page.keyboard.press('Escape');
   await edit('public class Test {\n  public static main([Ljava/lang/String;)V {\n    getstatic java/lang/System->out:Ljava/io/PrintStream;\n    pop\n    return\n  }\n}');
   await page.keyboard.down('Alt');await page.locator('.view-line span').filter({hasText:/^getstatic$/}).first().hover();
   await page.waitForFunction(()=>document.querySelector('.stack-hover:not([hidden])')?.textContent?.includes('実行前'));await page.keyboard.up('Alt');
 });
});
