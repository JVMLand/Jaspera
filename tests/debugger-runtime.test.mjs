import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
test('Bovine suspends real frames, steps calls, preserves values, breaks loops and can be interrupted',{timeout:180000},async t=>{
 const base='http://127.0.0.1:5251';const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5251','--strictPort'],{stdio:'pipe',windowsHide:true});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({channel:process.env.JALWEB_BROWSER??(process.platform==='win32'?'msedge':'chromium'),headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.on('pageerror',e=>console.log('PAGE',e.message));page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text().slice(0,1000));});await page.goto(base+'/tests/harness.html');
 const result=await page.evaluate(async()=>{
  const {Runtime}=await import('/src/runtime.ts');const vm=new Runtime(),seen=[],waiters=[],trace=[];let phase='entry';
  vm.onDebug=s=>{trace.push(s.location.method+':'+s.location.pc);const waiter=waiters.shift();waiter?waiter(s):seen.push(s);};
  const next=()=>Promise.race([seen.length?Promise.resolve(seen.shift()):new Promise(resolve=>waiters.push(resolve)),new Promise((_,reject)=>setTimeout(()=>reject(Error('No debugger stop: '+phase+' '+trace.join(','))),20000))]);
  const advance=async command=>{await vm.debugCommand(command);return next();};
  const compile=async source=>{const c=await vm.compile(source);if(!c.bytecode)throw Error(JSON.stringify(c.diagnostics));return c;};
  const source=`public class Main {
 public static main([Ljava/lang/String;)V {
 ldc "日本語🙂"
 astore_1
 ldc2_w 9007199254740993L
 lstore_2
 ldc 1.25f
 fstore 4
 ldc2_w 2.5d
 dstore 5
 iconst_2
 iconst_3
 invokestatic Main->calc(II)I
 istore 7
 return
 }
 public static calc(II)I {
 iload_0
 iload_1
 iadd
 ireturn
 }
}`;
  try{
   const compiled=await compile(source),run=vm.run(compiled,'',{stopOnEntry:true,classes:['Main'],breakpoints:[]});
   let stop=await next();const entry=stop;const states=[stop];
   while(stop.location.line!==13){stop=await advance('over');states.push(stop);if(states.length>20)throw Error('Stepping did not advance');}
   phase='into';const call=stop;const into=await advance('into');phase='inside';const inside=await advance('over');phase='out';const out=await advance('out');
   phase='stored';const stored=await advance('over');await vm.debugCommand('continue');await run;
   const normal=await vm.run(compiled,'');
   const helper=await compile(`public class Helper { public static calc(II)I {
 iload_0
 iload_1
 iadd
 ireturn
 } }`);
   const caller=await compile(`public class Main { public static main([Ljava/lang/String;)V {
 iconst_2
 iconst_3
 invokestatic Helper->calc(II)I
 pop
 return
 } }`);
   phase='class loading';const helperRun=vm.run({...caller,classes:[caller,helper]},'',{stopOnEntry:true,classes:['Main','Helper'],breakpoints:[]});
   await next();await advance('over');await advance('over');const loadedHelper=await advance('into');const returnedHelper=await advance('out');await vm.debugCommand('continue');await helperRun;
   const throwing=await compile(`public class Main {
 public static main([Ljava/lang/String;)V {
 Try: [~End, java/lang/ArithmeticException: Catch]
 iconst_1
 iconst_0
 idiv
 pop
 End:
 return
 Catch:
 astore_1
 return
 }
}`);
   phase='exception without debugger';await vm.run(throwing,'');
   phase='exception';const throwRun=vm.run(throwing,'',{stopOnEntry:true,classes:['Main'],breakpoints:[]});await next();await advance('over');await advance('over');const caught=await advance('over');await vm.debugCommand('continue');await throwRun;
   const threaded=await compile(`public class Main (super_class=java/lang/Thread) {
 public <init>()V {
 aload_0
 invokespecial java/lang/Thread-><init>()V
 return
 }
 public run()V {
 iconst_5
 istore_1
 return
 }
 public static main([Ljava/lang/String;)V {
 new Main
 dup
 invokespecial Main-><init>()V
 dup
 invokevirtual Main->start()V
 invokevirtual Main->join()V
 return
 }
}`);
   phase='thread';const threadRun=vm.run(threaded,'',{stopOnEntry:true,classes:['Main'],breakpoints:[{className:'Main',line:8}]});
   const parentThread=await next(),childThread=await advance('continue'),childValue=await advance('over');await vm.debugCommand('continue');await threadRun;
   const loop=await compile(`public class Main {
 public static main([Ljava/lang/String;)V {
 iconst_0
 istore_1
 Loop:
 iinc 1 1
 goto Loop
 }
}`);
   phase='loop';const running=vm.run(loop,'',{stopOnEntry:true,classes:['Main'],breakpoints:[{className:'Main',line:6}]}).then(()=>null,e=>e.message);
   await next();const first=await advance('continue'),second=await advance('continue');
   phase='pause';await vm.debugBreakpoints([]);await vm.debugCommand('continue');await new Promise(r=>setTimeout(r,30));await vm.debugCommand('pause');const paused=await next();
   vm.stop();const stopped=await running;
   const self=await compile(`public class Main { public static main([Ljava/lang/String;)V {
 Loop:
 goto Loop
 } }`);phase='self';const selfRun=vm.run(self,'',{stopOnEntry:true,classes:['Main'],breakpoints:[]}).catch(e=>e.message);
   const selfBefore=await next(),selfAfter=await advance('over');vm.stop();await selfRun;

   phase='field-types';const fields=await compile(`public class Main { public static main([Ljava/lang/String;)V {
 Loop:
 getstatic java/lang/System->out:Ljava/io/PrintStream;
 pop
 goto Loop
 } }`);
   const fieldRun=vm.run(fields,'',{stopOnEntry:true,classes:['Main'],breakpoints:[]}).catch(e=>e.message);
   const unresolvedField=(await next()).frames[0];await advance('over');await advance('over');const resolvedField=(await advance('over')).frames[0];vm.stop();await fieldRun;
   const {predictDebugFrame}=await import('/src/debug-prediction.ts');const predictions=states.slice(0,-1).map(s=>predictDebugFrame(s.frames[0]));
   return {unresolvedField,resolvedField,entry,predictions,states:states.map(s=>s.frames[0]),call,into,inside,out,stored,first,second,paused,stopped,normal,parentThread,childThread,childValue,selfBefore,selfAfter,caught,loadedHelper,returnedHelper};
  }catch(e){throw Error(phase+' '+trace.join(',')+' '+e.message);}finally{vm.stop();}
 });
 assert.equal(result.unresolvedField.instruction.fieldDescriptor,'Ljava/io/PrintStream;');assert.equal(result.resolvedField.instruction.fieldDescriptor,'Ljava/io/PrintStream;');assert.equal(result.resolvedField.instruction.opcode,'getstatic_L');
 for(let i=0;i<result.predictions.length;i++)assert.deepEqual(result.predictions[i].after,result.states[i+1].stack,'Prediction for '+result.states[i].instruction.opcode);
 assert.equal(result.entry.frames[0].instruction.opcode,'ldc');assert.equal(result.call.frames[0].instruction.arguments,2);assert.equal(result.call.frames[0].instruction.returns,true);assert.equal(result.entry.reason,'entry');assert.equal(result.entry.location.pc,0);
 assert.ok(result.states.some(f=>f.stack.includes('"日本語🙂"')));
 assert.ok(result.states.some(f=>f.stack.includes('9007199254740993L')));
 assert.ok(result.states.some(f=>f.stack.includes('1.25f')));
 assert.ok(result.states.some(f=>f.stack.includes('2.5d')));
 assert.deepEqual(result.call.frames[0].stack,['2','3']);
 assert.equal(result.into.location.method,'calc');assert.deepEqual(result.into.frames[0].locals,['2','3']);
 assert.deepEqual(result.inside.frames[0].stack,['2']);
 assert.equal(result.out.location.method,'main');assert.deepEqual(result.out.frames[0].stack,['5']);
 assert.equal(result.stored.frames[0].locals[7],'5');
 assert.equal(result.first.reason,'breakpoint');assert.equal(result.second.reason,'breakpoint');
 assert.equal(Number(result.second.frames[0].locals[1]),Number(result.first.frames[0].locals[1])+1);
 assert.equal(result.paused.reason,'pause');assert.ok(Number(result.paused.frames[0].locals[1])>1);
 assert.match(result.stopped,/停止/);
 assert.equal(result.loadedHelper.location.className,'Helper');assert.deepEqual(result.loadedHelper.frames[0].locals,['2','3']);
 assert.deepEqual(result.returnedHelper.frames[0].stack,['5']);
 assert.match(result.caught.frames[0].stack[0],/ArithmeticException/);
 assert.equal(result.caught.location.line,11);
 assert.notEqual(result.parentThread.location.thread,result.childThread.location.thread);
 assert.equal(result.childThread.location.method,'run');assert.deepEqual(result.childValue.frames[0].stack,['5']);
 assert.equal(result.selfBefore.location.pc,result.selfAfter.location.pc);assert.ok(result.selfAfter.location.sequence>result.selfBefore.location.sequence);
});
