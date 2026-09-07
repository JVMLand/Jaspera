import type {DebugCommand,DebugState,DebugFrame} from './debug-protocol';
import {renderFrameTransition} from './frame-transition';
import './debug-panel.css';
export interface DebugActions {start():void;command(command:DebugCommand):void;stop():void;reveal(frame:DebugFrame):void}
export function debugMenuItems(actions:DebugActions){return [
 {id:'debug-start',label:'デバッグ実行',shortcut:'Shift+F5',action:actions.start},
 {id:'debug-continue',label:'再開',shortcut:'F8',action:()=>actions.command('continue')},
 {id:'debug-pause',label:'一時停止',action:()=>actions.command('pause')},
 {id:'debug-over',label:'ステップオーバー',shortcut:'F10',action:()=>actions.command('over')},
 {id:'debug-into',label:'ステップイン',shortcut:'F11',action:()=>actions.command('into')},
 {id:'debug-out',label:'ステップアウト',shortcut:'Shift+F11',action:()=>actions.command('out')},
 {id:'debug-stop',label:'停止',action:actions.stop}
];}
export function installDebugKeys(actions:DebugActions){
 const listener=(e:KeyboardEvent)=>{if(e.ctrlKey||e.altKey||e.metaKey)return;const key=e.key;if(key==='F5'&&e.shiftKey){e.preventDefault();e.stopImmediatePropagation();actions.start();return;}const command=key==='F8'?'continue':key==='F10'?'over':key==='F11'?(e.shiftKey?'out':'into'):undefined;if(command){e.preventDefault();e.stopImmediatePropagation();actions.command(command);}};
 window.addEventListener('keydown',listener,true);return {dispose:()=>window.removeEventListener('keydown',listener,true)};
}
export function installDebugPanel(root:HTMLElement,actions:DebugActions){
 root.classList.add('debug-panel');const toolbar=document.createElement('div');toolbar.className='debug-toolbar';
 const stateLabel=document.createElement('p');stateLabel.className='debug-status';stateLabel.setAttribute('role','status');
 const list=document.createElement('div');list.className='debug-frames';list.setAttribute('aria-label','呼び出しスタック');
 const content=document.createElement('div');content.className='debug-values';
 const buttons=debugMenuItems(actions).map(item=>{const b=document.createElement('button');b.textContent=item.label;b.title=item.label+(item.shortcut?'（'+item.shortcut+'）':'');b.dataset.command=item.id;b.onclick=item.action;toolbar.append(b);return b;});
 root.replaceChildren(toolbar,stateLabel,list,content);let state:DebugState|undefined,selected=0;
 const labels={idle:'デバッグ実行すると，ここに実際の値が表示されます。',starting:'デバッグ実行を準備中…',running:'実行中',paused:'停止中（表示中の命令を実行する直前）',finished:'実行が終了しました。'};
 function render(){
  if(!state)return;stateLabel.textContent=labels[state.status];const paused=state.status==='paused',active=paused||state.status==='running'||state.status==='starting';
  buttons.forEach((b,i)=>b.disabled=i===0?active:i===2?!active||paused:i===6?!active:!paused);
  list.replaceChildren();content.replaceChildren();if(!paused||!state.snapshot)return;
  state.snapshot.frames.forEach((f,i)=>{const b=document.createElement('button');b.textContent=f.className.replaceAll('/','.')+'.'+f.method+f.descriptor+(f.native?'（native）':' · '+f.pc);b.className=i===selected?'selected':'';b.onclick=()=>{selected=i;render();actions.reveal(f);};list.append(b);});
  const frame=state.snapshot.frames[selected]??state.snapshot.frames[0];if(!frame)return;
  if(frame.native){content.textContent='ネイティブメソッド';return;}
  const previous=state.previous?.frames.find(f=>f.id===frame.id&&f.method===frame.method&&f.className===frame.className);
  const before=previous?.stack??frame.stack,after=frame.stack;let common=0;while(common<Math.min(before.length,after.length)&&before[common]===after[common])common++;
  content.append(renderFrameTransition({before,after,consumed:before.length-common,produced:after.length-common,beforeLabel:previous?'前の停止時':'現在',afterLabel:'現在',limit:65536,locals:{before:previous?.locals??frame.locals,after:frame.locals,changed:frame.locals.map((v,i)=>v!==previous?.locals[i]?i:-1).filter(i=>i>=0)}}));
 }
 return {update(next:DebugState|undefined){if(next===state)return;if(next?.snapshot!==state?.snapshot)selected=0;state=next??{status:'idle',breakpoints:[]};render();},dispose(){root.replaceChildren();}};
}
