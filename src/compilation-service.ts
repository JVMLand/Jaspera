import type {Compilation} from './protocol';

interface Compiler {
  compile(source:string):Promise<Compilation>;
  stop():void;
}

/** Workspace-owned compilation queue. All views share in-flight and completed results.
 * Identity is the document object, not its path, so reopening a path cannot reuse
 * another document's result. Source snapshots remain valid while edits continue.
 */
export class CompilationService {
  private cache=new WeakMap<object,{source:string;promise:Promise<Compilation>}>();
  private queue:Promise<unknown>=Promise.resolve();
  private disposed=false;
  constructor(private compiler:Compiler){}

  compile(document:object,source:string):Promise<Compilation>{
    if(this.disposed)return Promise.reject(new Error('解析サービスは終了しています。'));
    const cached=this.cache.get(document);
    if(cached?.source===source)return cached.promise;
    const promise=this.queue.then(()=>{
      if(this.disposed)throw new Error('解析サービスは終了しています。');
      return this.compiler.compile(source);
    });
    const entry={source,promise};
    this.cache.set(document,entry);
    this.queue=promise.catch(()=>{
      // An older failure must not discard a newer revision's pending result.
      if(this.cache.get(document)===entry)this.cache.delete(document);
    });
    return promise;
  }

  dispose(){this.disposed=true;this.cache=new WeakMap();this.compiler.stop();}
}
