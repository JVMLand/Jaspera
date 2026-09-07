import type {PanelName} from './panel-dock';
import type {Catalog} from './completion';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type {DefinitionDocument} from './navigation';
export interface EditorSnapshot {id:string;source:string;uri:string;version:number;title:string;readOnly:boolean;theme:string;diagnostics:monaco.editor.IMarkerData[]}
export interface ToolState {output:{text:string;stream:string}[];stdin:string;problems:{label:string;severity:string}[]}
export interface DetachedState {tools?:ToolState;canSave:boolean;running:boolean;status:string;theme:string;files:{key:string;title:string}[]}
export interface DetachedClient {instruction?:(op:string)=>void;panel?:(name:PanelName)=>void;panelRemoved?:(name:PanelName)=>void;update:(snapshot:EditorSnapshot)=>void;remove?:(id:string)=>void;state?:(state:DetachedState)=>void;reveal?:(range?:monaco.IRange|monaco.IPosition,id?:string)=>void}
export interface DetachedDocument {key:string;title:string;model:monaco.editor.ITextModel;readOnly:boolean}
export interface DetachedBridge {workspaceId:string;instruction:(op:string)=>void;
 panels:(group:string)=>PanelName[];openPanel:(group:string,name:PanelName)=>void;closePanel:(group:string,name:PanelName)=>void;problem:(index:number,group:string)=>void;stdin:(text:string)=>void;clearOutput:()=>void;
 completionCatalog:()=>Promise<Catalog>;
 attach:(id:string,client:DetachedClient)=>EditorSnapshot|undefined;
 tabs:(id:string)=>EditorSnapshot[];openTab:(group:string,key:string)=>EditorSnapshot|undefined;closeTab:(group:string,id:string)=>void;
 edit:(id:string,version:number,source:string)=>EditorSnapshot|undefined;undo:(id:string,redo:boolean)=>void;
 definitions:(id:string,offset:number)=>Promise<DefinitionDocument[]>;openDefinition:(group:string,uri:string,range?:monaco.IRange|monaco.IPosition)=>Promise<boolean>;
 save:()=>void;run:()=>void;stop:()=>void;check:()=>void;theme:(id:string)=>void;
 classFile:(id:string)=>Promise<{name:string;bytecode:string}|undefined>;release:(id:string)=>void;
}
declare global {interface Window {jalwebDetached?:DetachedBridge}}
// Apply a minimal change so parent selections, decorations and undo history survive.
export function replaceText(model:monaco.editor.ITextModel,text:string){
 const before=model.getValue();if(before===text)return;
 let start=0,end=before.length,last=text.length;
 while(start<end&&start<last&&before[start]===text[start])start++;
 while(end>start&&last>start&&before[end-1]===text[last-1]){end--;last--;}
 const a=model.getPositionAt(start),b=model.getPositionAt(end);
 model.pushEditOperations(null,[{range:new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column),text:text.slice(start,last)}],()=>null);
}
// Monaco 0.52 TextModel exposes undo/redo; its public ITextModel declaration omits them.
type UndoableModel=monaco.editor.ITextModel & {undo:()=>void|Promise<void>;redo:()=>void|Promise<void>};
interface Entry extends DetachedDocument {id:string;group:string;subscriptions:monaco.IDisposable[]}
interface Group {id:string;popup:Window;client?:DetachedClient;panels:Set<PanelName>}
interface Options {instruction?:(op:string)=>void;
 panelOpened?:(name:PanelName)=>void;problem?:(index:number,group:string)=>void;stdin?:(text:string)=>void;clearOutput?:()=>void;
 completionCatalog:()=>Promise<Catalog>;
 state:()=>DetachedState;document:(keyOrUri:string)=>DetachedDocument|undefined;
 resolve:(model:monaco.editor.ITextModel,offset:number)=>Promise<DefinitionDocument[]>;
 stop:()=>void;check:()=>void;theme:(id:string)=>void;classFile:(model:monaco.editor.ITextModel)=>Promise<{name:string;bytecode:string}|undefined>;
}
export function createDetachedHost(onReturn:(key:string)=>void,save:()=>void,run:()=>void,options:Options){
 const entries=new Map<string,Entry>(),groups=new Map<string,Group>();
 const snapshot=(e:Entry):EditorSnapshot=>({id:e.id,source:e.model.getValue(),uri:e.model.uri.toString(),version:e.model.getVersionId(),title:e.title,readOnly:e.readOnly,theme:document.documentElement.dataset.theme??'jal-night',diagnostics:monaco.editor.getModelMarkers({owner:'jal',resource:e.model.uri})});
 const broadcast=(e:Entry)=>{if(!e.model.isDisposed())try{groups.get(e.group)?.client?.update(snapshot(e));}catch{}};
 const remove=(id:string)=>{const e=entries.get(id);if(!e)return;entries.delete(id);for(const d of e.subscriptions)d.dispose();groups.get(e.group)?.client?.remove?.(id);onReturn(e.key);closeIfEmpty(e.group);};
 const release=(id:string)=>{const g=groups.get(id);if(!g)return;groups.delete(id);for(const name of g.panels)onReturn('panel:'+name);for(const e of [...entries.values()])if(e.group===id)remove(e.id);try{g.popup.close();}catch{}};
 // Check after the entire tab transfer, not during temporary empty client states.
 function closeIfEmpty(id:string){queueMicrotask(()=>{const g=groups.get(id);if(g&&!g.panels.size&&![...entries.values()].some(e=>e.group===id))release(id);});}
 const add=(group:string,doc:DetachedDocument,id=crypto.randomUUID())=>{
  const e:Entry={...doc,id,group,subscriptions:[]};entries.set(id,e);doc.model.pushStackElement();
  e.subscriptions.push(doc.model.onDidChangeContent(()=>broadcast(e)),doc.model.onWillDispose(()=>remove(id)),monaco.editor.onDidChangeMarkers(uris=>{if(uris.some(u=>u.toString()===doc.model.uri.toString()))broadcast(e);}));
  return e;
 };
 const openTab=(group:string,key:string)=>{
  if(!groups.has(group))return;const doc=options.document(key);if(!doc||doc.model.isDisposed())return;
  let e=[...entries.values()].find(e=>e.key===doc.key);
  if(e&&e.group!==group){const previous=e.group;groups.get(previous)?.client?.remove?.(e.id);e.group=group;closeIfEmpty(previous);}
  if(!e)e=add(group,doc);broadcast(e);onReturn(e.key);return snapshot(e);
 };
 const closePanel=(group:string,name:PanelName)=>{const g=groups.get(group);if(g?.panels.delete(name)){g.client?.panelRemoved?.(name);onReturn('panel:'+name);closeIfEmpty(group);}};
 const openPanel=(group:string,name:PanelName)=>{const g=groups.get(group);if(!g)return;for(const other of groups.values())if(other.id!==group&&other.panels.delete(name)){other.client?.panelRemoved?.(name);closeIfEmpty(other.id);}g.panels.add(name);options.panelOpened?.(name);g.client?.panel?.(name);};
 window.jalwebDetached={workspaceId:crypto.randomUUID(),
  instruction:op=>options.instruction?.(op),
  panels:id=>[...(groups.get(id)?.panels??[])],openPanel,closePanel,problem:(index,group)=>options.problem?.(index,group),stdin:text=>options.stdin?.(text),clearOutput:()=>options.clearOutput?.(),
  completionCatalog:()=>options.completionCatalog(),
  attach(id,client){const g=groups.get(id);if(!g)return;g.client=client;client.state?.(options.state());const e=[...entries.values()].find(e=>e.group===id);return e?snapshot(e):undefined;},
  tabs:id=>[...entries.values()].filter(e=>e.group===id).map(snapshot),openTab,
  closeTab(group,id){if(entries.get(id)?.group===group)remove(id);},
  edit(id,version,source){const e=entries.get(id);if(!e||e.model.isDisposed())return;if(!e.readOnly&&version===e.model.getVersionId())replaceText(e.model,source);return snapshot(e);},
  undo(id,redo){const e=entries.get(id);if(e&&!e.readOnly&&!e.model.isDisposed()){e.model.pushStackElement();const history=e.model as UndoableModel;if(redo)void history.redo();else void history.undo();}},
  definitions(id,offset){const e=entries.get(id);return e?options.resolve(e.model,offset):Promise.resolve([]);},
  async openDefinition(group,uri,range){const state=openTab(group,uri);if(!state)return false;groups.get(group)?.client?.reveal?.(range,state.id);return true;},
  save(){if(options.state().canSave)save();},run,stop:options.stop,check:options.check,theme:options.theme,
  classFile:async id=>{const e=entries.get(id);return e&&!e.readOnly?options.classFile(e.model):undefined;},release
 };
 let lastState='';
 const refresh=()=>{const state=options.state(),serialized=JSON.stringify(state);if(serialized===lastState)return;lastState=serialized;for(const g of groups.values())try{g.client?.state?.(state);}catch{}};
 const watcher=setInterval(()=>{for(const g of groups.values())if(g.popup.closed)release(g.id);refresh();},300);
 const observer=new MutationObserver(()=>{for(const e of entries.values())broadcast(e);refresh();});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 return {
  showInstruction(op:string){const g=[...groups.values()].find(g=>g.panels.has('instructions'));if(g)g.client?.instruction?.(op);},
  hasPanel:(name:PanelName)=>[...groups.values()].some(g=>g.panels.has(name)),
  focusPanel(name:PanelName){const g=[...groups.values()].find(g=>g.panels.has(name));if(g){g.client?.panel?.(name);g.popup.focus();}},
  openPanel(name:PanelName){if(this.hasPanel(name)){this.focusPanel(name);return true;}const id=crypto.randomUUID(),url=new URL('detached.html',location.href);url.searchParams.set('editor',id);const popup=window.open(url.href,'jalweb-'+id,'popup,width=900,height=680');if(!popup)return false;groups.set(id,{id,popup,panels:new Set()});openPanel(id,name);return true;},
  returnTab(key:string){const e=[...entries.values()].find(e=>e.key===key);if(e)remove(e.id);},
  has:(key:string)=>[...entries.values()].some(e=>e.key===key),
  focus(key:string){const e=[...entries.values()].find(e=>e.key===key);if(e){groups.get(e.group)?.client?.reveal?.(undefined,e.id);groups.get(e.group)?.popup.focus();}},
  reveal(key:string,range?:monaco.IRange|monaco.IPosition){const e=[...entries.values()].find(e=>e.key===key);if(e){groups.get(e.group)?.client?.reveal?.(range,e.id);groups.get(e.group)?.popup.focus();}},
  open(key:string,title:string,model:monaco.editor.ITextModel,readOnly:boolean){
   if(this.has(key)){this.focus(key);return true;}
   const id=crypto.randomUUID(),url=new URL('detached.html',location.href);url.searchParams.set('editor',id);
   const popup=window.open(url.href,'jalweb-'+id,'popup,width=900,height=680');if(!popup)return false;
   groups.set(id,{id,popup,panels:new Set()});add(id,{key,title,model,readOnly},id);return true;
  },
  closeAll(){for(const id of [...groups.keys()])release(id);},
  dispose(){clearInterval(watcher);observer.disconnect();this.closeAll();delete window.jalwebDetached;}
 };
}
