import {helpMenuItems,showHelpMessage} from './help';
import * as monaco from './editor-platform';
import {SourceAnalysis,showBytecodeOffsets} from './source-analysis';
import {EditorPane,paneTab,paneIdentity,beforePane,movePaneOrder,arrangePaneTabs} from './pane';
import type {WindowLayout} from './workspace-layout';
import type {FileView} from './project';
import {paneDrop} from './tab-interactions';
import {followInstructionClicks} from './instruction-click';
import {installDetachedTools} from './detached-tools';
import {installStackHover} from './stack-hover';
import {installDefinitionUI} from './navigation';
import {registerLanguage} from './language';
import {applyTheme} from './themes';
import {replaceText,type EditorSnapshot,type DetachedBridge} from './detached-host';
import {installMenus} from './menus';
import {themes} from './themes';
import type {DetachedState} from './detached-host';
import './style.css';
import './detached.css';
registerLanguage(()=>bridge?.completionCatalog()??Promise.resolve({}));
const group=new URL(location.href).searchParams.get('editor')??'';
const bridge:DetachedBridge|undefined=window.opener?.jalwebDetached;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
interface Tab {state:EditorSnapshot;model:monaco.editor.ITextModel;view:monaco.editor.ICodeEditorViewState|null;savedView?:FileView}
const paneOrder:string[]=[];const tabs=new Map<string,Tab>();let active:string|undefined,applying=false,workspace:DetachedState={tools:{output:[],stdin:'',problems:[]},canSave:false,running:false,status:'',theme:'jal-night',files:[]};
const overlays=document.createElement('div');overlays.id='editor-overlays';document.body.append(overlays);
export const editor=monaco.editor.create(el('editor'),{overflowWidgetsDomNode:overlays,automaticLayout:true,fontSize:15,lineHeight:27,minimap:{enabled:false},scrollBeyondLastLine:false,tabSize:2,fixedOverflowWidgets:true,lineNumbersMinChars:10});
const stackHover=installStackHover(editor,model=>{
 const tab=[...tabs.values()].find(t=>t.model===model);
 return tab&&bridge?bridge.compilation(tab.state.id,tab.state.version):Promise.reject(new Error('元のワークスペースに接続できません。'));
});
const syncTheme=()=>overlays.className=editor.getDomNode()!.className;const observer=new MutationObserver(syncTheme);observer.observe(editor.getDomNode()!,{attributes:true,attributeFilter:['class']});syncTheme();
let toolTabs:ReturnType<typeof installDetachedTools>|undefined;
const current=()=>!toolTabs?.active&&active?tabs.get(active):undefined;
const sourceAnalysis=new SourceAnalysis(model=>{if(current()?.model===model)showOffsets();},model=>[...tabs.values()].some(t=>t.model===model&&!t.state.readOnly));
function inspect(tab:Tab){sourceAnalysis.schedule(tab.model);}
function showOffsets(){showBytecodeOffsets(editor,sourceAnalysis.offsets(current()?.model??null));}
function select(id:string){const old=current();toolTabs?.showSource();const next=tabs.get(id);if(!next)return;if(old){old.view=editor.saveViewState();old.savedView=fileView();}active=id;editor.setModel(next.model);editor.updateOptions({readOnly:next.state.readOnly});if(next.view)editor.restoreViewState(next.view);else if(next.savedView){const v=next.savedView;editor.setPosition(next.model.validatePosition({lineNumber:v.line,column:v.column}));editor.setScrollPosition({scrollTop:v.scrollTop,scrollLeft:v.scrollLeft});}showOffsets();renderTabs();updateActions();}
function fileView():FileView{const p=editor.getPosition();return {line:p?.lineNumber??1,column:p?.column??1,scrollTop:Math.round(editor.getScrollTop()),scrollLeft:Math.round(editor.getScrollLeft())};}
function layout():Pick<WindowLayout,'active'|'views'|'wordWrap'|'order'>{const views:Record<string,FileView>=Object.create(null);for(const [id,tab] of tabs){if(id===active)tab.savedView=fileView();if(tab.savedView)views[tab.state.key]=tab.savedView;}return {order:[...paneOrder],active:toolTabs?.active?'panel:'+toolTabs.active:tabs.get(active??'')?.state.key??'',views,wordWrap:editor.getRawOptions().wordWrap==='on'};}
function restoreLayout(layout:WindowLayout){paneOrder.splice(0,paneOrder.length,...(layout.order??[]));for(const tab of tabs.values())tab.savedView=layout.views[tab.state.key];editor.updateOptions({wordWrap:layout.wordWrap?'on':'off'});const tab=[...tabs.values()].find(t=>t.state.key===layout.active)??tabs.get(active??'');if(tab){active=undefined;tab.view=null;select(tab.state.id);}if(layout.active.startsWith('panel:'))toolTabs?.show(layout.active.slice(6) as import('./panel-dock').PanelName);}
function closeTab(id:string,others=false){for(const key of [...tabs.keys()])if(others?key!==id:key===id)bridge?.closeTab(group,key);if(others)select(id);}
function renderTabs(){
 el('file-tabs').replaceChildren();for(const [id,tab] of tabs){
  const pane=new EditorPane(tab.state.key,tab.state.title,{select:()=>select(id),close:others=>{if(others)toolTabs?.closeOthers();closeTab(id,others);}});
  el('file-tabs').append(paneTab(pane,bridge?.workspaceId??'',!toolTabs?.active&&active===id).wrapper);
 }
 toolTabs?.renderTabs(el('file-tabs'),()=>{for(const id of [...tabs.keys()])bridge?.closeTab(group,id);});arrangePaneTabs(el('file-tabs'),paneOrder);
}

function update(snapshot:EditorSnapshot){
 let tab=tabs.get(snapshot.id);if(!tab){
  const model=monaco.editor.getModel(monaco.Uri.parse(snapshot.uri))??monaco.editor.createModel(snapshot.source,'jal',monaco.Uri.parse(snapshot.uri));tab={state:snapshot,model,view:null,savedView:snapshot.view};tabs.set(snapshot.id,tab);
  const entry=tab;model.onDidChangeContent(()=>{inspect(entry);if(applying)return;const result=bridge?.edit(entry.state.id,entry.state.version,model.getValue());if(result)update(result);});inspect(tab);renderTabs();
 }
 tab.state=snapshot;applyTheme(snapshot.theme,false);
 if(tab.model.getValue()!==snapshot.source){applying=true;replaceText(tab.model,snapshot.source);applying=false;}
 monaco.editor.setModelMarkers(tab.model,'jal',snapshot.diagnostics);if(!active)select(snapshot.id);updateActions();
}
function remove(id:string){const tab=tabs.get(id);if(!tab)return;const keys=[...tabs.keys()],at=keys.indexOf(id);tabs.delete(id);if(active===id){editor.setModel(null);active=undefined;}tab.model.dispose();if(!active){const next=[...tabs.keys()][Math.min(at,tabs.size-1)];if(next)select(next);}renderTabs();updateActions();}
function updateActions(){
 const tab=current();document.title=(toolTabs?.active??tab?.state.title??'JALWeb Editor')+' — JALWeb';menus.hidden('save-project',!workspace.canSave);menus.disabled('close-tab',!tab&&!toolTabs?.active);menus.disabled('close-others',!tab||tabs.size<2);menus.disabled('open-workspace-file',!workspace.files.length);
 for(const id of ['undo','redo','replace','comment','quick-fix'])menus.disabled(id,!tab||tab.state.readOnly);menus.disabled('find',!tab);menus.disabled('download',!tab||tab.state.readOnly);menus.disabled('menu-run',workspace.running);menus.disabled('menu-stop',!workspace.running);
}
const action=(id:string)=>{editor.focus();editor.trigger('menu',id,undefined);};
const save=()=>{if(workspace.canSave)bridge?.save();};const run=()=>bridge?.run();

function openFile(){const select=el<HTMLSelectElement>('workspace-files');select.replaceChildren();for(const file of workspace.files){const option=document.createElement('option');option.value=file.key;option.textContent=file.title;select.append(option);}el<HTMLDialogElement>('open-file').showModal();}
async function downloadClass(){if(!active)return;const result=await bridge?.classFile(active);if(!result){showHelpMessage('class を保存できませんでした','ソースのコンパイル結果を確認してください。');return;}const bytes=Uint8Array.from(atob(result.bytecode),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes]));const a=document.createElement('a');a.href=url;a.download=result.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const menus=installMenus(el('menus'),[
 {label:'File',items:[{id:'open-workspace-file',label:'ワークスペースのファイルを開く…',shortcut:'Ctrl+O',action:openFile},{id:'save-project',label:'プロジェクトを保存',shortcut:'Ctrl+S',action:save},{id:'close-tab',label:'このタブを閉じる',action:()=>{if(toolTabs?.active)bridge?.closePanel(group,toolTabs.active);else if(active)closeTab(active);}},{id:'close-others',label:'他のタブを閉じる',action:()=>{if(active)closeTab(active,true);}},{id:'close-window',label:'ウィンドウを閉じる',action:()=>window.close()}]},
 {label:'Edit',items:[{id:'undo',label:'元に戻す',shortcut:'Ctrl+Z',action:()=>{if(active)bridge?.undo(active,false);}},{id:'redo',label:'やり直す',shortcut:'Ctrl+Y',action:()=>{if(active)bridge?.undo(active,true);}},{id:'find',label:'検索',shortcut:'Ctrl+F',action:()=>action('actions.find')},{id:'replace',label:'置換',shortcut:'Ctrl+H',action:()=>action('editor.action.startFindReplaceAction')},{id:'comment',label:'行コメントの切り替え',shortcut:'Ctrl+/',action:()=>action('editor.action.commentLine')},{id:'quick-fix',label:'Quick Fix…',shortcut:'Ctrl+.',action:()=>action('editor.action.quickFix')},{id:'wrap',label:'折り返しの切り替え',action:()=>editor.updateOptions({wordWrap:editor.getRawOptions().wordWrap==='on'?'off':'on'})},{id:'theme',label:'テーマ…',action:()=>{el<HTMLSelectElement>('themes').value=workspace.theme;el<HTMLDialogElement>('theme-picker').showModal();}}]},
 {label:'View',items:(['project','console','problems','instructions'] as const).map(name=>({id:'show-'+name,label:name[0].toUpperCase()+name.slice(1),action:()=>bridge?.openPanel(group,name)}))},
 {label:'Build',items:[{id:'check',label:'プロジェクトを検査',action:()=>bridge?.check()},{id:'menu-run',label:'実行',shortcut:'Ctrl+Enter',action:run},{id:'menu-stop',label:'停止',action:()=>bridge?.stop()},{id:'download',label:'現在のファイルの .class を保存…',action:()=>void downloadClass()}]},
 {label:'Help',items:helpMenuItems(true,()=>workspace.canSave)}
]);
el<HTMLDialogElement>('open-file').addEventListener('close',()=>{if(el<HTMLDialogElement>('open-file').returnValue==='open'){const snapshot=bridge?.openTab(group,el<HTMLSelectElement>('workspace-files').value);if(snapshot){update(snapshot);select(snapshot.id);}}});
for(const theme of themes){const option=document.createElement('option');option.value=theme.id;option.textContent=theme.label;el('themes').append(option);}el<HTMLSelectElement>('themes').onchange=()=>bridge?.theme(el<HTMLSelectElement>('themes').value);
toolTabs=installDetachedTools(bridge,group,()=>{renderTabs();updateActions();editor.layout();});
const instructionClicks=followInstructionClicks(editor,op=>{toolTabs?.showInstruction(op);bridge?.instruction(op);});
const initial=bridge?.attach(group,{layout,restoreLayout,update,remove,instruction:op=>toolTabs?.showInstruction(op),panel:name=>toolTabs?.show(name),panelRemoved:name=>toolTabs?.remove(name),state:state=>{workspace=state;toolTabs?.update(state.tools,state.files);applyTheme(state.theme,false);el('status').textContent=state.status||'編集内容は元のワークスペースと共有されます。';updateActions();},reveal:(selection,id)=>{if(id)select(id);if(selection){const p='startLineNumber' in selection?{lineNumber:selection.startLineNumber,column:selection.startColumn}:selection;editor.setPosition(p);editor.revealPositionInCenter(p);}editor.focus();}});
for(const snapshot of bridge?.tabs(group)??[])update(snapshot);if(initial)select(initial.id);else if(!bridge)el('status').textContent='元のワークスペースに接続できません。';updateActions();for(const name of bridge?.panels(group)??[])toolTabs?.show(name);
bridge?.ready(group);
const dropFiles=paneDrop(document.body,bridge?.workspaceId??'',(key,event)=>{
 const pane=paneIdentity(key);if(!pane)return;movePaneOrder(paneOrder,key,beforePane(el('file-tabs'),key,event.clientX));
 if(pane.kind==='tool')bridge?.openPanel(group,pane.name);
 else {const snapshot=bridge?.openTab(group,key);if(snapshot){update(snapshot);select(snapshot.id);editor.focus();}}
 renderTabs();
});
const definitionUI=installDefinitionUI((model,offset)=>{const tab=[...tabs.values()].find(t=>t.model===model);return tab?bridge?.definitions(tab.state.id,offset)??Promise.resolve([]):Promise.resolve([]);},(uri,range)=>bridge?.openDefinition(group,uri,range)??false);

editor.addAction({id:'detached.undo',label:'Undo',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyZ],run:()=>{if(active)bridge?.undo(active,false);}});
editor.addAction({id:'detached.redo',label:'Redo',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyY,monaco.KeyMod.CtrlCmd|monaco.KeyMod.Shift|monaco.KeyCode.KeyZ],run:()=>{if(active)bridge?.undo(active,true);}});
editor.addAction({id:'detached.run',label:'Run',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter,monaco.KeyCode.F5],run});
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey){if(e.key.toLowerCase()==='s'){e.preventDefault();save();}else if(e.key.toLowerCase()==='o'){e.preventDefault();if(!document.querySelector('dialog[open]'))openFile();}}});
window.addEventListener('pagehide',()=>{dropFiles.dispose();instructionClicks.dispose();toolTabs?.dispose();stackHover.dispose();definitionUI.dispose();bridge?.release(group);observer.disconnect();overlays.remove();sourceAnalysis.dispose();editor.dispose();for(const tab of tabs.values()){tab.model.dispose();}});
