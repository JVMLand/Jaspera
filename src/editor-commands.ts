import * as monaco from './editor-platform';

export function installEditorCommands(editor:monaco.editor.IStandaloneCodeEditor,run:()=>void,undo?:(redo:boolean)=>void){
 const actions=[editor.addAction({id:'jal.run',label:'JAL: Run',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter,monaco.KeyCode.F5],run})];
 if(undo){
  actions.push(editor.addAction({id:'jal.undo',label:'Undo',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyZ],run:()=>undo(false)}));
  actions.push(editor.addAction({id:'jal.redo',label:'Redo',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyY,monaco.KeyMod.CtrlCmd|monaco.KeyMod.Shift|monaco.KeyCode.KeyZ],run:()=>undo(true)}));
 }
 return {dispose(){for(const action of actions)action.dispose();}};
}
export function installWindowCommands(commands:{save:()=>void;open:()=>void}){
 const keydown=(event:KeyboardEvent)=>{
  if(event.defaultPrevented||event.isComposing||document.querySelector('dialog[open]')||event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey))return;
  const key=event.key.toLowerCase();if(key==='s'||key==='o'){event.preventDefault();if(key==='s')commands.save();else commands.open();}
 };
 window.addEventListener('keydown',keydown);
 return {dispose(){window.removeEventListener('keydown',keydown);}};
}
