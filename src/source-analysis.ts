import * as monaco from './editor-platform';
import {WorkerRpc} from './worker-rpc';
import type {OffsetsApi} from './offsets.worker';
import OffsetWorker from './offsets.worker?worker';
import {publishInspections} from './inspection-actions';
import type {SourceOffset} from './offsets.js';

type Model=monaco.editor.ITextModel;
type Analysis=ReturnType<OffsetsApi['analyze']>;

/** Lightweight syntax analysis shared by both editor hosts; no JVM is needed. */
export class SourceAnalysis {
  private worker=new WorkerRpc<OffsetsApi>(()=>new OffsetWorker());
  private cache=new WeakMap<Model,{version:number;data:Analysis}>();
  private pending=new Map<Model,{timer:ReturnType<typeof setTimeout>;dispose:monaco.IDisposable}>();
  private disposed=false;
  private formatting=monaco.languages.registerDocumentFormattingEditProvider('jal',{
    provideDocumentFormattingEdits:async(model,options,token)=>{
      const version=model.getVersionId(),source=model.getValue();
      const text=await this.worker.call(api=>api.format(source,options));
      if(this.disposed||token.isCancellationRequested||model.isDisposed()||model.getVersionId()!==version||text===source)return [];
      return [{range:model.getFullModelRange(),text}];
    }
  });
  private hintsChanged=new monaco.Emitter<void>();
  private hints=monaco.languages.registerInlayHintsProvider('jal',{
    onDidChangeInlayHints:this.hintsChanged.event,
    provideInlayHints:(model,range)=>{
      const cached=this.cache.get(model);
      const hints:monaco.languages.InlayHint[]=cached?.version===model.getVersionId()?cached.data.parameters.map(item=>({
        position:model.getPositionAt(item.offset),label:`${item.slot}:`,kind:monaco.languages.InlayHintKind.Parameter,
        paddingLeft:item.slot>0,paddingRight:true,
        tooltip:`ローカル変数スロット ${item.slot}${item.width===2?'・'+(item.slot+1)+'（2 スロット）':''}`
      })).filter(hint=>range.containsPosition(hint.position)):[];
      return {hints,dispose(){}};
    }
  });
  constructor(private changed:(model:Model)=>void,private editable:(model:Model)=>boolean){}

  schedule(model:Model){
    this.cancel(model);
    if(this.disposed||model.isDisposed())return;
    // Keep the last offsets visible until a current analysis can replace them.
    this.hintsChanged.fire();
    publishInspections(model,[]);
    const dispose=model.onWillDispose(()=>this.cancel(model));
    const timer=setTimeout(()=>{
      this.cancel(model);
      if(this.disposed||model.isDisposed())return;
      const version=model.getVersionId();
      void this.worker.call(api=>api.analyze(model.getValue())).then(data=>{
        if(this.disposed||model.isDisposed()||model.getVersionId()!==version)return;
        this.cache.set(model,{version,data});
        this.hintsChanged.fire();
        if(this.editable(model))publishInspections(model,data.inspections);
        this.changed(model);
      }).catch(error=>{if(!this.disposed)console.error('ソース解析に失敗しました。',error);});
    },80);
    this.pending.set(model,{timer,dispose});
  }

  offsets(model:Model|null):SourceOffset[]{
    const cached=model?this.cache.get(model):undefined;
    return cached?.data.offsets??[];
  }
  private cancel(model:Model){const pending=this.pending.get(model);if(pending){clearTimeout(pending.timer);pending.dispose.dispose();this.pending.delete(model);}}
  dispose(){this.disposed=true;this.formatting.dispose();this.hints.dispose();this.hintsChanged.dispose();for(const model of this.pending.keys())this.cancel(model);this.worker.dispose();}
}

export function showBytecodeOffsets(view:monaco.editor.IStandaloneCodeEditor,offsets:SourceOffset[]){
  const lines=new Map<number,SourceOffset[]>();
  for(const item of offsets)lines.set(item.line,[...(lines.get(item.line)??[]),item]);
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  view.updateOptions({lineNumbers:line=>{
    const items=lines.get(line)??[],first=items[0];
    const title=first?'バイトコードオフセット（命令解析による推定・10進数）\n'+items.map(i=>`${i.method}: ${i.offset}`).join('\n'):'';
    return `<span class="jal-source-line">${line}</span><span class="jal-bytecode-offset" title="${escape(title)}">${first?first.offset+(items.length>1?'…':''):''}</span>`;
  }});
}
