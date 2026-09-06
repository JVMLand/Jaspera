import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {instructionNames} from './language';
import {Runtime} from './runtime';
import type {Compilation,StackFrame} from './protocol';
import './stack-hover.css';

export function installStackHover(editor:monaco.editor.IStandaloneCodeEditor,known?:(model:monaco.editor.ITextModel)=>Compilation|undefined){
 const panel=document.createElement('div');panel.className='stack-hover';panel.hidden=true;panel.setAttribute('role','tooltip');panel.setAttribute('aria-label','命令実行前後のスタック');document.body.append(panel);
 const runtime=new Runtime(),cache=new WeakMap<monaco.editor.ITextModel,{version:number;promise:Promise<Compilation>}>();let queue=Promise.resolve<unknown>(undefined),serial=0,alt=false,disposed=false,last:monaco.Position|null=null,shown='';let anchor:monaco.IPosition|undefined;
 const hover=editor.getRawOptions().hover;
 const node=(tag:string,text?:string,className?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 function hide(){if(!shown&&panel.hidden)return;serial++;shown='';panel.hidden=true;editor.updateOptions({hover:{...hover,enabled:hover?.enabled??true}});}
 function place(position:monaco.IPosition){
  const point=editor.getScrolledVisiblePosition(position),rect=editor.getDomNode()?.getBoundingClientRect();if(!point||!rect){hide();return;}
  const width=panel.offsetWidth,height=panel.offsetHeight,left=Math.max(8,Math.min(rect.left+point.left,innerWidth-width-8));
  const below=rect.top+point.top+point.height+7,above=rect.top+point.top-height-7;
  panel.style.left=left+'px';panel.style.top=Math.max(8,below+height<=innerHeight-8?below:above)+'px';
 }
 function column(title:string,values:string[],localIndices?:number[]){
  const col=node('section',undefined,'stack-hover-column');col.append(node('h4',title));
  const indices=localIndices??values.map((_,i)=>i).reverse();
  if(!indices.length)col.append(node('div','空','stack-hover-empty'));
  const visible=indices.slice(0,8);
  for(const i of visible){const row=node('div',undefined,'stack-hover-value');row.append(node('span',localIndices?'#'+i:i===values.length-1?'TOP':'#'+i,'stack-hover-slot'),node('code',values[i]??'未設定'));col.append(row);}
  if(indices.length>visible.length)col.append(node('div',`ほか ${indices.length-visible.length} 要素`,'stack-hover-more'));
  return col;
 }
 function pair(before:string[],after:string[],indices?:number[]){const grid=node('div',undefined,'stack-hover-pair');grid.append(column('実行前',before,indices),node('span','→','stack-hover-arrow'),column('実行後',after,indices));return grid;}
 function render(frame:StackFrame){
  if(frame.unreachable){panel.append(node('p','この命令には到達しません。実行前後の状態はありません。'));return;}
  const before=frame.before??[],after=frame.after??[];
  const heading=node('div',undefined,'stack-hover-section');heading.append(node('strong','STACK'),node('span',`${before.length} → ${after.length} 要素`));panel.append(heading,pair(before,after));
  if(frame.local!==undefined&&frame.local>=0){
   const a=frame.localsBefore??[],b=frame.localsAfter??[],indices=[frame.local];
   for(let i=0;i<Math.max(a.length,b.length);i++)if(i!==frame.local&&a[i]!==b[i])indices.push(i);indices.sort((a,b)=>a-b);
   const heading=node('div',undefined,'stack-hover-section');heading.append(node('strong','LOCALS'),node('span',frame.effect??`#${frame.local} を更新`));panel.append(heading,pair(a,b,indices));
  }
 }
 async function show(){
  if(!alt||!last||disposed)return;
  const model=editor.getModel(),position=last;if(!model)return;
  const word=model.getWordAtPosition(position);if(!word||!instructionNames.includes(word.word)){hide();return;}
  const version=model.getVersionId(),key=model.uri+':'+version+':'+position.lineNumber+':'+word.startColumn;if(key===shown)return;
  shown=key;const request=++serial;editor.updateOptions({hover:{...hover,enabled:false}});
  anchor={lineNumber:position.lineNumber,column:word.startColumn};const currentAnchor=anchor;
  const header=()=>{const h=node('header');h.append(node('code',word.word),node('span','静的解析 · 型'),node('kbd','Alt'));return h;};
  panel.replaceChildren(header(),node('p','スタックを解析しています…','stack-hover-loading'));panel.hidden=false;place(currentAnchor);
  try{
   let compilation=known?.(model);
   if(!compilation){let cached=cache.get(model);if(!cached||cached.version!==version){const source=model.getValue();const promise=queue.then(()=>{if(disposed)throw new Error('Closed');return runtime.compile(source);});queue=promise.catch(()=>{});cached={version,promise};cache.set(model,cached);}compilation=await cached.promise;}
   if(disposed||request!==serial||!alt||model.isDisposed()||editor.getModel()!==model||model.getVersionId()!==version)return;
   const frame=compilation.stackFrames?.find(f=>f.line===position.lineNumber&&word.startColumn>=f.column&&word.startColumn<f.column+f.length);
   panel.replaceChildren(header());
   if(frame)render(frame);else panel.append(node('p',compilation.diagnostics.find(d=>d.severity==='error')?.message??'この命令の状態を解析できません。ソースを確認してください。'));
   place(currentAnchor);
  }catch(error){if(request!==serial||disposed)return;panel.replaceChildren(header(),node('p',error instanceof Error?error.message:'解析できませんでした。'));place(currentAnchor);cache.delete(model);}
 }
 const listeners=[editor.onMouseMove(e=>{last=e.target.position;alt=(alt||e.event.altKey)&&!e.event.ctrlKey&&!e.event.metaKey;if(alt)void show();else hide();}),editor.onMouseLeave(()=>{last=null;hide();}),editor.onDidChangeModel(()=>{last=null;hide();}),editor.onDidChangeModelContent(()=>hide()),editor.onDidScrollChange(e=>{if(e.scrollTopChanged||e.scrollLeftChanged)hide();}),editor.onDidLayoutChange(()=>{if(!panel.hidden&&anchor)place(anchor);})];
 const down=(e:KeyboardEvent)=>{if(e.key==='Alt'&&!e.ctrlKey&&!e.metaKey){alt=true;if(last){e.preventDefault();void show();}}else if(e.key==='Escape'){alt=false;hide();}};
 const up=(e:KeyboardEvent)=>{if(e.key==='Alt'){alt=false;hide();}};
 const blur=()=>{alt=false;last=null;hide();};window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
 return {dispose(){disposed=true;hide();listeners.forEach(l=>l.dispose());window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);panel.remove();runtime.stop();}};
}
