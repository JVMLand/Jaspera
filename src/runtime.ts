import {expose,transfer} from 'comlink';
import {WorkerRpc,scopedEndpoint} from './worker-rpc';
import type {RuntimeApi} from './runtime.worker';
import type {Compilation,Disassembly,RuntimeRequest,RuntimeEvents} from './protocol';
export class Runtime {
 private rpc=new WorkerRpc<RuntimeApi>(()=>new Worker(new URL('./runtime.worker.ts',import.meta.url),{type:'module'}));
 private active?:object;
 constructor(private heapMiB=128){}
 onProgress:(loaded:number,total:number)=>void=()=>{};
 onOutput:(stream:'stdout'|'stderr',text:string)=>void=()=>{};
 private async request(request:RuntimeRequest,timeout:number){
  if(this.active)throw new Error('JVM は処理中です。');
  const token={};this.active=token;
  const channel=new MessageChannel(),scope=scopedEndpoint(channel.port1);
  const events:RuntimeEvents={progress:(loaded,total)=>{if(this.active===token)this.onProgress(loaded,total);},output:(stream,text)=>{if(this.active===token)this.onOutput(stream,text);}};
  expose(events,scope.endpoint);
  try{return await this.rpc.call<Compilation|Disassembly|void>(api=>api.execute(request,transfer(channel.port2,[channel.port2]),this.heapMiB),timeout);}
  catch(error){if(this.active===token)this.rpc.stop();throw error;}
  finally{scope.dispose();channel.port2.close();if(this.active===token)this.active=undefined;}
 }
 compile(source:string){return this.request({type:'compile',source},60_000) as Promise<Compilation>;}
 disassemble(bytecode:string){return this.request({type:'disassemble',bytecode},30_000) as Promise<Disassembly>;}
 run(compilation:Compilation,stdin:string){return this.request({type:'run',compilation,stdin},30_000);}
 stop(message='停止しました。'){this.active=undefined;this.rpc.stop(message);}
}
