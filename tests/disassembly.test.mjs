import test from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {chromium} from '@playwright/test';
test('class decompilation, drag/drop, folder view and preservation of sources',{timeout:120000},async t=>{
 await mkdir('.cache/disassembly-test',{recursive:true});await writeFile('.cache/disassembly-test/DropProbe.java',`public class DropProbe {
 public static final String VALUE="Japanese: 日本語";
 static { System.out.println("INITIALIZER MUST NOT RUN"); }
 public static int choose(int n){try {switch(n){case 1:return 10;case 20:return 30;default:return 0;}}catch(RuntimeException e){return -1;}}
 public static String concat(int n){return "value="+n;}
 public static Class<?> type(){return String.class;}
}`);
 const javac=spawnSync('javac',['--release','21','-encoding','UTF-8','-d','.cache/disassembly-test','.cache/disassembly-test/DropProbe.java'],{encoding:'utf8'});assert.equal(javac.status,0,javac.stderr);
 const bytes=await readFile('.cache/disassembly-test/DropProbe.class'),base='http://127.0.0.1:5185';
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5185','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium'),headless:true});t.after(()=>browser.close());const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('#state').textContent==='実行できます');
 const menu=async id=>{await page.locator('#menu-file').click();await page.locator('#'+id).click();};
 const drop=async(name,bytes)=>page.evaluate(({name,bytes})=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],name));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},{name,bytes:[...bytes]});
 const source=()=>page.evaluate(async()=>{const {editor}=await import('/src/main.ts');return editor.getValue();});
 await t.test('ASM parsing never initializes the input class; a simple JAL roundtrip recompiles',async()=>{
  const result=await page.evaluate(async bytes=>{const {Runtime}=await import('/src/runtime.ts');const runtime=new Runtime();let output='';runtime.onOutput=(_stream,text)=>output+=text;try{const probe=await runtime.disassemble(btoa(String.fromCharCode(...bytes)));const compiled=await runtime.compile('public class RoundTrip { public static main([Ljava/lang/String;)V { return } }');const restored=await runtime.disassemble(compiled.bytecode);const checked=await runtime.compile(restored.source);return {output,probe:probe.source,diagnostics:checked.diagnostics,className:checked.className};}finally{runtime.stop();}},[...bytes]);
  assert.equal(result.output,'');assert.ok(result.probe.startsWith('/*\n  Decompiled by JALP (Java Assembly Language Parser)\n  Class: DropProbe.class\n  Compiled from "DropProbe.java"\n*/\n'));assert.doesNotMatch(result.probe,/注意:|再コンパイル|表せない|powered by ASM|recreated/);assert.match(result.probe,/ldc Ljava\/lang\/String;/);assert.match(result.probe,/INITIALIZER MUST NOT RUN/);assert.deepEqual(result.diagnostics,[]);assert.equal(result.className,'RoundTrip');
 });
 await t.test('drop opens a readonly JAL tab without running class initializers',async()=>{
  await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');editor.setValue(editor.getValue()+'\n// keep my edit');});
  await drop('DropProbe.class',bytes);await page.waitForFunction(()=>document.querySelector('#file-tabs [aria-selected=true]').textContent==='DropProbe.class (JAL)',null,{timeout:45000});
  await page.screenshot({path:'.cache/disassembly-view.png'});const text=await source();assert.match(text,/public super class DropProbe/);assert.match(text,/VALUE:Ljava\/lang\/String;/);assert.match(text,/lookupswitch/);assert.match(text,/invokedynamic/);assert.match(text,/\[~L/);assert.equal(await page.locator('#output').textContent(),'');
  assert.equal(await page.evaluate(async()=>{const {editor}=await import('/src/main.ts');const monaco=await import('/node_modules/monaco-editor/esm/vs/editor/editor.api.js');return editor.getOption(monaco.editor.EditorOption.readOnly);}),true);
  await page.getByRole('tab',{name:'src/Main.jal',exact:true}).click();assert.match(await source(),/keep my edit/);assert.match(await page.locator('#project-name').textContent(),/•/);
 });
 await t.test('invalid input preserves the current source',async()=>{await drop('broken.class',new Uint8Array([1,2,3]));await page.locator('#dialog').waitFor({state:'visible'});assert.match(await page.locator('#dialog-message').textContent(),/有効な/);assert.match(await source(),/keep my edit/);await page.locator('#dialog-ok').click();});
 await t.test('folder class entries open through the same pipeline and are never saved as source',async()=>{
  await page.evaluate(async bytes=>{const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('class-project',{create:true});const src=await root.getDirectoryHandle('src',{create:true});const build=await root.getDirectoryHandle('build',{create:true});for(const [dir,name,text] of [[root,'project.jalprj',JSON.stringify({format:'jalprj',version:1,name:'Class Project',entryFile:'src/Main.jal'})],[src,'Main.jal','public class Main { public static main([Ljava/lang/String;)V { return } }'],[build,'DropProbe.class',new Uint8Array(bytes)]]){const w=await (await dir.getFileHandle(name,{create:true})).createWritable();await w.write(text);await w.close();}window.showDirectoryPicker=async()=>root;},[...bytes]);
  await menu('open-project');await page.locator('#dialog').waitFor({state:'visible'});await page.locator('#dialog-ok').click();await page.waitForFunction(()=>document.querySelector('#project-name').textContent==='Class Project');
  await page.locator('#file-list button[title="build/DropProbe.class"]').click();await page.waitForFunction(()=>document.querySelector('#file-tabs [aria-selected=true]').textContent==='build/DropProbe.class (JAL)',null,{timeout:45000});assert.match(await source(),/class DropProbe/);
  await page.keyboard.press('ControlOrMeta+S');await page.waitForFunction(()=>document.querySelector('#state').textContent==='フォルダーに保存しました');
  const saved=await page.evaluate(async()=>{const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('class-project');const src=await root.getDirectoryHandle('src');const names=[];for await(const [name] of src.entries())names.push(name);return names;});assert.deepEqual(saved,['Main.jal']);
  await page.evaluate(async()=>{const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('class-project');await (await root.getDirectoryHandle('build')).removeEntry('DropProbe.class');});await page.waitForFunction(()=>![...document.querySelectorAll('#file-tabs [role=tab]')].some(b=>b.textContent.includes('.class')));
 });
 assert.deepEqual(errors,[]);
});
