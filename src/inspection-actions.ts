import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type {Inspection} from './inspections.js';
const cache=new WeakMap<monaco.editor.ITextModel,{version:number;items:Inspection[]}>();
const range=(model:monaco.editor.ITextModel,start:number,end:number)=>{
 const a=model.getPositionAt(start),b=model.getPositionAt(end);
 return new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column);
};
export function publishInspections(model:monaco.editor.ITextModel,items:Inspection[]){
 cache.set(model,{version:model.getVersionId(),items});
 monaco.editor.setModelMarkers(model,'jal-inspections',items.map(i=>({
  ...range(model,i.start,i.end),message:i.message,code:i.code,source:'JAL Inspection',
  severity:i.severity==='error'?monaco.MarkerSeverity.Error:monaco.MarkerSeverity.Warning,
  tags:i.code==='unreachable'?[monaco.MarkerTag.Unnecessary]:undefined
 })));
}
export function currentInspections(model:monaco.editor.ITextModel){
 const entry=cache.get(model);return entry?.version===model.getVersionId()?entry.items:[];
}
monaco.languages.registerCodeActionProvider('jal',{
 provideCodeActions(model,selection){
  if(model.uri.authority!=='jal')return {actions:[],dispose(){}};
  const actions:monaco.languages.CodeAction[]=currentInspections(model).filter(i=>i.edits&&i.title&&monaco.Range.areIntersectingOrTouching(range(model,i.start,i.end),selection)).map(i=>({
   title:i.title!,kind:'quickfix',isPreferred:true,
   diagnostics:monaco.editor.getModelMarkers({owner:'jal-inspections',resource:model.uri}).filter(m=>m.code===i.code&&m.startLineNumber===model.getPositionAt(i.start).lineNumber&&m.startColumn===model.getPositionAt(i.start).column),
   edit:{edits:i.edits!.map(e=>({resource:model.uri,versionId:model.getVersionId(),textEdit:{range:range(model,e.start,e.end),text:e.text}}))}
  }));
  return {actions,dispose(){}};
 }
},{providedCodeActionKinds:['quickfix']});
