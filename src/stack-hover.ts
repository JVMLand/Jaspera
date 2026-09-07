import {renderFrameTransition} from './frame-transition';
import * as monaco from './editor-platform';
import {instructionNames} from './language';
import type {Compilation,StackFrame} from './protocol';
import './stack-hover.css';

export function installStackHover(editor:monaco.editor.IStandaloneCodeEditor,analyze:(model:monaco.editor.ITextModel)=>Promise<Compilation>){
 const panel=document.createElement('div');panel.className='stack-hover';panel.hidden=true;panel.setAttribute('role','tooltip');panel.setAttribute('aria-label','命令実行前後のスタック');document.body.append(panel);
 let serial=0,disposed=false,last:monaco.Position|null=null,shown='';let anchor:monaco.IPosition|undefined;let timer:ReturnType<typeof setTimeout>|undefined,leaveTimer:ReturnType<typeof setTimeout>|undefined;
 const hover=editor.getRawOptions().hover;
 const node=(tag:string,text?:string,className?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 function hide(){clearTimeout(timer);clearTimeout(leaveTimer);if(!shown&&panel.hidden)return;serial++;shown='';panel.hidden=true;editor.updateOptions({hover:{...hover,enabled:hover?.enabled??true}});}
 function place(position:monaco.IPosition){
  const point=editor.getScrolledVisiblePosition(position),rect=editor.getDomNode()?.getBoundingClientRect();if(!point||!rect){hide();return;}
  const width=panel.offsetWidth,height=panel.offsetHeight,left=Math.max(8,Math.min(rect.left+point.left,innerWidth-width-8));
  const below=rect.top+point.top+point.height+7,above=rect.top+point.top-height-7;
  panel.style.left=left+'px';panel.style.top=Math.max(8,below+height<=innerHeight-8?below:above)+'px';
 }
 function render(frame:StackFrame){
  if(frame.unreachable){panel.append(node('p','この命令には到達しません。実行前後の状態はありません。'));return;}
  const before=frame.before??[],after=frame.after??[];
  let locals;
  if(frame.local!==undefined&&frame.local>=0){const a=frame.localsBefore??[],b=frame.localsAfter??[],indices=[frame.local];for(let i=0;i<Math.max(a.length,b.length);i++)if(i!==frame.local&&a[i]!==b[i])indices.push(i);indices.sort((a,b)=>a-b);locals={before:indices.map(i=>a[i]??'未設定'),after:indices.map(i=>b[i]??'未設定'),labels:indices.map(i=>'#'+i),effect:frame.effect};}
  panel.append(renderFrameTransition({before,after,consumed:frame.consumed??0,produced:frame.produced??0,terminal:frame.terminal,locals}));
 }
 async function show(){
  if(!last||disposed)return;
  const model=editor.getModel(),position=last;if(!model)return;
  const word=model.getWordAtPosition(position);if(!word||!instructionNames.includes(word.word)){hide();return;}
  const tokens=monaco.editor.tokenize(model.getValue(),'jal')[position.lineNumber-1],offset=position.column-1;const token=tokens.find((t,i)=>t.offset<=offset&&(tokens[i+1]?.offset??Infinity)>offset);if(!token?.type.startsWith('keyword.instruction.')){hide();return;}
  const version=model.getVersionId(),key=model.uri+':'+version+':'+position.lineNumber+':'+word.startColumn;if(key===shown)return;
  shown=key;const request=++serial;editor.updateOptions({hover:{...hover,enabled:false}});
  anchor={lineNumber:position.lineNumber,column:word.startColumn};const currentAnchor=anchor;
  const header=()=>{const h=node('header');h.append(node('code',word.word),node('span','この位置のフレーム · 静的解析'));return h;};
  panel.replaceChildren(header(),node('p','スタックを解析しています…','stack-hover-loading'));panel.hidden=false;place(currentAnchor);
  try{
   const compilation=await analyze(model);
   if(disposed||request!==serial||model.isDisposed()||editor.getModel()!==model||model.getVersionId()!==version)return;
   const frame=compilation.stackFrames?.find(f=>f.line===position.lineNumber&&word.startColumn>=f.column&&word.startColumn<f.column+f.length);
   panel.replaceChildren(header());
   if(frame)render(frame);else panel.append(node('p',compilation.diagnostics.find(d=>d.severity==='error')?.message??'この命令の状態を解析できません。ソースを確認してください。'));
   place(currentAnchor);
  }catch(error){if(request!==serial||disposed)return;panel.replaceChildren(header(),node('p',error instanceof Error?error.message:'解析できませんでした。'));place(currentAnchor);}
 }
 function schedule(immediate=false){clearTimeout(timer);timer=setTimeout(()=>void show(),immediate?0:250);}
 const listeners=[editor.onMouseMove(e=>{clearTimeout(leaveTimer);if(e.event.ctrlKey||e.event.metaKey||e.target.type!==monaco.editor.MouseTargetType.CONTENT_TEXT){last=null;hide();return;}const position=e.target.position;if(position&&last&&position.equals(last))return;last=position;hide();if(last)schedule(e.event.altKey);}),editor.onMouseLeave(()=>{leaveTimer=setTimeout(()=>{last=null;hide();},120);}),editor.onDidChangeModel(()=>{last=null;hide();}),editor.onDidChangeModelContent(()=>{hide();if(last)schedule();}),editor.onDidScrollChange(e=>{if(e.scrollTopChanged||e.scrollLeftChanged){last=null;hide();}}),editor.onDidLayoutChange(()=>{if(!panel.hidden&&anchor)place(anchor);})];
 panel.onpointerenter=()=>clearTimeout(leaveTimer);panel.onpointerleave=()=>{last=null;hide();};
 const down=(e:KeyboardEvent)=>{if(e.key==='Control'||e.key==='Meta'||e.key==='Escape'){hide();if(e.key==='Escape')last=null;}else if(e.key==='Alt'&&last&&!e.ctrlKey&&!e.metaKey){e.preventDefault();schedule(true);}};
 const up=(e:KeyboardEvent)=>{if((e.key==='Control'||e.key==='Meta')&&last)schedule();};
 const blur=()=>{last=null;hide();};window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
 return {dispose(){disposed=true;hide();listeners.forEach(l=>l.dispose());window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);panel.remove();}};
}
