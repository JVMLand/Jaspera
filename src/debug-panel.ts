import type {DebugCommand,DebugState,DebugFrame} from './debug-protocol';
import {renderFrameTransition} from './frame-transition';
import {predictDebugFrame} from './debug-prediction';
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
 root.classList.add('debug-panel');const toolbar=document.createElement('div');toolbar.className='debug-toolbar';toolbar.hidden=true;toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','デバッグ操作');
 const stateLabel=document.createElement('p');stateLabel.className='debug-status';stateLabel.setAttribute('role','status');
 const list=document.createElement('div');list.className='debug-frames';list.setAttribute('aria-label','呼び出しスタック');
 const content=document.createElement('div');content.className='debug-values';
 const icons:Record<string,string>={
  'debug-continue':'<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  'debug-pause':'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  'debug-over':'<path d="M4 12a8 8 0 0 1 16 0m-4-3 4 3 2-4"/><circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none"/>',
  'debug-into':'<path d="M12 3v12m-4-4 4 4 4-4"/><circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none"/>',
  'debug-out':'<path d="M12 15V3m-4 4 4-4 4 4"/><circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none"/>',
  'debug-stop':'<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>'
 };
 const indicator=document.createElement('span');indicator.className='debug-toolbar-state';toolbar.append(indicator);
 const buttons=debugMenuItems(actions).filter(item=>item.id!=='debug-start').map(item=>{const b=document.createElement('button');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[item.id]+'</svg>';b.title=item.label+(item.shortcut?'（'+item.shortcut+'）':'');b.setAttribute('aria-label',item.label);b.dataset.command=item.id;b.onclick=item.action;toolbar.append(b);return b;});
 document.body.append(toolbar);root.replaceChildren(stateLabel,list,content);let state:DebugState|undefined,selected=0;
 const waiting='デバッガは待機中です。Run で実行を開始します。ブレークポイントを置くと，その命令で一時停止してフレームを確認できます。';
 const labels={idle:waiting,starting:'デバッグ実行を準備中…',running:'実行中',paused:'フレーム',finished:waiting};
 function render(){
  if(!state)return;stateLabel.textContent=labels[state.status];const paused=state.status==='paused',active=paused||state.status==='running'||state.status==='starting';
  toolbar.hidden=!active;toolbar.dataset.state=state.status;indicator.textContent=paused?'停止中':state.status==='starting'?'準備中':'実行中';
  const running=state.status==='running';buttons.forEach(b=>{const id=b.dataset.command;b.hidden=id==='debug-continue'?!paused:id==='debug-pause'?paused:false;b.disabled=id==='debug-stop'?!active:id==='debug-pause'?!running:!paused;});
  list.replaceChildren();content.replaceChildren();if(!paused||!state.snapshot)return;
  state.snapshot.frames.forEach((f,i)=>{const b=document.createElement('button');b.textContent=f.className.replaceAll('/','.')+'.'+f.method+f.descriptor+(f.native?'（native）':' · '+f.pc);b.className=i===selected?'selected':'';b.onclick=()=>{selected=i;render();actions.reveal(f);};list.append(b);});
  const frame=state.snapshot.frames[selected]??state.snapshot.frames[0];if(!frame)return;
  if(frame.native){content.textContent='ネイティブメソッド';return;}
  const prediction=predictDebugFrame(frame);
  if(selected>0&&frame.callSnapshot)prediction.beforeLabel='呼び出し時';
  else if(selected>0){prediction.after=[];prediction.consumed=0;prediction.produced=0;prediction.locals=undefined;prediction.terminal='呼び出し先の実行待ち';prediction.note=undefined;}
  content.append(renderFrameTransition(prediction));
 }
 return {update(next:DebugState|undefined){if(next===state)return;if(next?.snapshot!==state?.snapshot)selected=0;state=next??{status:'idle',breakpoints:[]};render();},dispose(){toolbar.remove();root.replaceChildren();}};
}
