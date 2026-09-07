import {WorkerRpc} from './worker-rpc';
import type {NavigationApi} from './navigation.worker';
import type {Catalog} from './completion';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import NavigationWorker from './navigation.worker?worker';
import type {SymbolIndex,SymbolReference,ClassSymbol,Span} from './symbols.js';
export interface SearchTarget {label:string;detail:string;kind:'file'|'class'|'method'|'field';uri?:string;offset?:number;owner?:string;name?:string;descriptor?:string}
export interface DefinitionDocument {uri:string;source:string;range:monaco.IRange;origin:monaco.IRange;label?:boolean}
export function installDefinitionUI(resolve:(model:monaco.editor.ITextModel,offset:number,labelsOnly?:boolean)=>Promise<DefinitionDocument[]>,open:(uri:string,range?:monaco.IRange|monaco.IPosition)=>boolean|Promise<boolean>){
 const provider=monaco.languages.registerDefinitionProvider('jal',{async provideDefinition(model,position,token){
  const version=model.getVersionId();try{
   const results=await resolve(model,model.getOffsetAt(position));if(token.isCancellationRequested||model.isDisposed()||model.getVersionId()!==version)return [];
   return results.map(d=>{const uri=monaco.Uri.parse(d.uri);if(!monaco.editor.getModel(uri))monaco.editor.createModel(d.source,'jal',uri);return {originSelectionRange:d.origin,uri,range:d.range,targetSelectionRange:d.range};});
  }catch{return [];}
 }});
 const opener=monaco.editor.registerEditorOpener({openCodeEditor:(_editor,uri,selection)=>open(uri.toString(),selection)});
 const listeners=new Map<monaco.editor.ICodeEditor,monaco.IDisposable>();
 const attach=(editor:monaco.editor.ICodeEditor)=>{
  let request=0;
  const mouse=editor.onMouseDown(event=>{
   const ticket=++request,position=event.target.position,model=editor.getModel();
   if(!event.event.leftButton||!event.event.shiftKey||event.event.ctrlKey||event.event.metaKey||event.event.altKey||!position||!model||event.target.type!==monaco.editor.MouseTargetType.CONTENT_TEXT)return;
   const version=model.getVersionId();
   void resolve(model,model.getOffsetAt(position),true).then(targets=>{
    if(ticket!==request||editor.getModel()!==model||model.isDisposed()||model.getVersionId()!==version||!targets.length||!targets.every(t=>t.label))return;
    editor.setPosition(position);editor.focus();
    if(targets.length===1){editor.setSelection(targets[0].range);editor.revealRangeInCenterIfOutsideViewport(targets[0].range);}
    else editor.trigger('label-navigation','editor.action.peekDefinition',{});
   }).catch(()=>{});
  });
  const dispose=()=>{++request;mouse.dispose();listeners.delete(editor);};
  const closed=editor.onDidDispose(dispose);listeners.set(editor,{dispose(){dispose();closed.dispose();}});
 };
 for(const editor of monaco.editor.getEditors())attach(editor);
 const created=monaco.editor.onDidCreateEditor(attach);
 return {dispose(){created.dispose();for(const listener of [...listeners.values()])listener.dispose();provider.dispose();opener.dispose();}};
}
interface Host {models:()=>monaco.editor.ITextModel[];classBytes:(owner:string)=>Promise<Uint8Array|undefined>;disassemble:(bytes:Uint8Array)=>Promise<{source:string;className:string}>}
export function createNavigation(host:Host){
 const worker=new WorkerRpc<NavigationApi>(()=>new NavigationWorker());let epoch=0;
 let cache=new WeakMap<monaco.editor.ITextModel,{version:number;promise:Promise<SymbolIndex>}>();
 const definitions=new Map<string,Promise<monaco.editor.ITextModel|undefined>>(),owned=new Set<monaco.editor.ITextModel>();
 const index=(model:monaco.editor.ITextModel)=>{const version=model.getVersionId(),old=cache.get(model);if(old?.version===version)return old.promise;const promise=worker.call(api=>api.analyze(model.getValue()));cache.set(model,{version,promise});return promise;};
 async function findClass(owner:string):Promise<{model:monaco.editor.ITextModel;symbol:ClassSymbol}[]>{
  const found=[];
  for(const model of host.models()){if(model.isDisposed())continue;for(const symbol of (await index(model)).classes)if(symbol.owner===owner)found.push({model,symbol});}
  const sources=found.filter(t=>t.model.uri.authority==='jal');if(sources.length)return sources;
  if(found.length)return found;
  let load=definitions.get(owner);if(!load){const current=epoch;load=(async()=>{
   const bytes=await host.classBytes(owner)??await worker.call(api=>api.classBytes(owner));if(!bytes||current!==epoch)return;
   const result=await host.disassemble(bytes);if(current!==epoch||result.className!==owner)return;
   const uri=monaco.Uri.from({scheme:'inmemory',authority:'definition',path:'/'+owner+'.jal'});
   const model=monaco.editor.getModel(uri)??monaco.editor.createModel(result.source,'jal',uri);owned.add(model);return model;
  })().catch(e=>{definitions.delete(owner);throw e;});definitions.set(owner,load);}
  const model=await load;if(!model||model.isDisposed()){definitions.delete(owner);return [];}
  return (await index(model)).classes.filter(c=>c.owner===owner).map(symbol=>({model,symbol}));
 }
 const range=(model:monaco.editor.ITextModel,span:Span)=>{const a=model.getPositionAt(span.start),b=model.getPositionAt(span.end);return new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column);};
 async function lookup(ref:SymbolReference,visited=new Set<string>()):Promise<{model:monaco.editor.ITextModel;span:Span}[]>{
  if(visited.has(ref.owner)||visited.size>=32)return [];visited.add(ref.owner);const classes=await findClass(ref.owner),found=[];
  for(const {model,symbol} of classes){
   if(ref.kind==='class'){found.push({model,span:symbol});continue;}
   const members=symbol.members.filter(m=>m.kind===ref.kind&&m.name===ref.name&&m.descriptor===ref.descriptor);
   if(members.length)found.push(...members.map(span=>({model,span})));
   else if(ref.name!=='<init>'&&ref.name!=='<clinit>'){
    // For fields interfaces precede the superclass; methods prefer the superclass.
    const parents=ref.kind==='field'?[...symbol.parents.slice(1),...symbol.parents.slice(0,1)]:symbol.parents;
    for(const owner of parents){const inherited=await lookup({...ref,owner},visited);if(inherited.length){found.push(...inherited);break;}}
   }
  }
  return found;
 }
 return {
  async searchTargets():Promise<SearchTarget[]>{
   const current=epoch,targets:SearchTarget[]=[];
   for(const model of host.models()){
    if(model.isDisposed())continue;
    const uri=model.uri.toString(),detail=model.uri.path.slice(1);
    targets.push({kind:'file',label:detail.split('/').pop()!,detail,uri,offset:0});
    const symbols=await index(model);if(current!==epoch)return [];
    for(const c of symbols.classes){
     targets.push({kind:'class',label:c.owner.split('/').pop()!,detail:c.owner.replaceAll('/','.'),uri,offset:c.start});
     for(const m of c.members)targets.push({kind:m.kind,label:m.name+(m.kind==='field'?':':'')+m.descriptor,detail:c.owner.replaceAll('/','.'),uri,offset:m.start});
    }
   }
   return targets;
  },
  async searchDefinition(target:SearchTarget){
   if(target.uri){const model=monaco.editor.getModel(monaco.Uri.parse(target.uri));return model&&!model.isDisposed()?{uri:target.uri,range:range(model,{start:target.offset??0,end:target.offset??0})}:undefined;}
   if(!target.owner)return;
   const results=await lookup({kind:target.kind==='file'?'class':target.kind,owner:target.owner,name:target.name,descriptor:target.descriptor,start:0,end:0});
   const result=results[0];return result?{uri:result.model.uri.toString(),range:range(result.model,result.span)}:undefined;
  },
  async classModel(owner:string){return (await findClass(owner))[0]?.model;},
  async completionCatalog():Promise<Catalog>{
   const current=epoch,catalog:Catalog=Object.create(null);
   const sources=host.models().filter(m=>!m.isDisposed()&&m.uri.authority==='jal');
   const results=await Promise.all(sources.map(async model=>({model,symbols:await index(model)})));
   if(current!==epoch)return catalog;
   for(const {model,symbols} of results){if(model.isDisposed())continue;
    for(const c of symbols.classes)catalog[c.owner]=c.members.filter(m=>m.name!=='<clinit>').map(m=>({kind:m.kind,static:m.static,name:m.name+(m.kind==='field'?':':'')+m.descriptor}));
   }
   return catalog;
  },
  async resolve(model:monaco.editor.ITextModel,offset:number,labelsOnly=false):Promise<DefinitionDocument[]>{
   const current=epoch,version=model.getVersionId(),symbols=await index(model),ref=symbols.references.find(r=>offset>=r.start&&offset<r.end);if(!ref||(labelsOnly&&ref.kind!=='label'))return [];
   let targets:{model:monaco.editor.ITextModel;span:Span}[];
   if(ref.kind==='label'){
    const target=ref.target;if(!target)return [];
    const spans=ref.start===target.start
     ? symbols.references.filter(r=>r.kind==='label'&&r.target?.start===target.start&&r.target?.end===target.end&&r.start!==ref.start)
     : [target];
    targets=spans.map(span=>({model,span}));
   }else targets=await lookup(ref);
   if(current!==epoch||model.isDisposed()||model.getVersionId()!==version)return [];
   return targets.filter(t=>!t.model.isDisposed()).map(t=>({uri:t.model.uri.toString(),source:t.model.getValue(),range:range(t.model,t.span),origin:range(model,ref),label:ref.kind==='label'}));
  },
  reset(){epoch++;definitions.clear();cache=new WeakMap();for(const model of owned)if(!model.isDisposed())model.dispose();owned.clear();},
  dispose(){this.reset();worker.dispose();}
 };
}
