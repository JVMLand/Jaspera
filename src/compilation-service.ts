import type {Compilation,Disassembly,AnalysisProgress} from './protocol';

interface Compiler {
  compile(source:string,onProgress?:(progress:AnalysisProgress)=>void):Promise<Compilation>;
  disassemble(bytecode:string):Promise<Disassembly>;
  stop():void;
}

/** Workspace-owned compilation queue. All views share in-flight and completed results.
 * Identity is the document object, not its path, so reopening a path cannot reuse
 * another document's result. Source snapshots remain valid while edits continue.
 */
type ProgressListener=(progress:AnalysisProgress)=>void;
interface Entry {source:string;promise:Promise<Compilation>;progress:AnalysisProgress;partials:AnalysisProgress[];listeners:Set<ProgressListener>;settled:boolean}
export class CompilationService {
  private cache=new WeakMap<object,Entry>();
  private queue:Promise<unknown>=Promise.resolve();
  private disposed=false;
  private pending=0;
  private background=false;
  private idleTimer:ReturnType<typeof setTimeout>|undefined;
  constructor(private compiler:Compiler,private backgroundIdleMs=60_000){}

  private enqueue<T>(work:()=>Promise<T>):Promise<T>{
    clearTimeout(this.idleTimer);this.pending++;
    const promise=this.queue.then(()=>{
      if(this.disposed)throw new Error('解析サービスは終了しています。');
      return work();
    });
    this.queue=promise.then(()=>{},()=>{}).then(()=>{this.pending--;this.scheduleIdle();});
    return promise;
  }
  private scheduleIdle(){
    clearTimeout(this.idleTimer);
    if(!this.disposed&&this.background&&this.pending===0)this.idleTimer=setTimeout(()=>this.compiler.stop(),this.backgroundIdleMs);
  }
  setBackground(background:boolean){this.background=background;this.scheduleIdle();}
  disassemble(bytecode:string){
    if(this.disposed)return Promise.reject(new Error('解析サービスは終了しています。'));
    return this.enqueue(()=>this.compiler.disassemble(bytecode));
  }

  compile(document:object,source:string,onProgress?:ProgressListener):Promise<Compilation>{
    if(this.disposed)return Promise.reject(new Error('解析サービスは終了しています。'));
    const cached=this.cache.get(document);
    if(cached?.source===source){this.subscribe(cached,onProgress);return cached.promise;}
    const promise=this.enqueue(()=>{
      if(this.cache.get(document)!==entry){const error=new Error('新しい編集内容に置き換えられたため解析を省略しました。');error.name='AbortError';throw error;}
      return this.compiler.compile(source,progress=>{
        if(entry.settled)return;
        entry.progress=progress;if(progress.graph)entry.partials.push(progress);
        for(const listener of entry.listeners)try{listener(progress);}catch{}
      });
    });
    const entry:Entry={source,promise,progress:{phase:"queued",completed:0,total:0},partials:[],listeners:new Set(),settled:false};
    this.cache.set(document,entry);this.subscribe(entry,onProgress);
    const finish=()=>{entry.settled=true;entry.listeners.clear();entry.partials=[];entry.progress={phase:"complete",completed:1,total:1};};
    void promise.then(finish,finish);
    void promise.catch(()=>{
      // An older failure must not discard a newer revision's pending result.
      if(this.cache.get(document)===entry)this.cache.delete(document);
    });
    return promise;
  }

  private subscribe(entry:Entry,listener?:ProgressListener){
    if(!listener||entry.settled)return;
    entry.listeners.add(listener);
    try{for(const partial of entry.partials)listener(partial);listener(entry.progress);}catch{}
  }

  dispose(){this.disposed=true;clearTimeout(this.idleTimer);this.cache=new WeakMap();this.compiler.stop();}
}
