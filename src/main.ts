import {EditorPane,paneTab,paneIdentity,beforePane,movePaneOrder} from './pane';
import {layoutSides,type WorkspaceLayout} from './workspace-layout';
import {renderProjectTree} from './project-tree';
import {paneDrop} from './tab-interactions';
import type {Side} from './panel-dock';
import {followInstructionClicks} from './instruction-click';
import {installPanelDock} from './panel-dock';
import {WorkerRpc} from './worker-rpc';
import type {OffsetsApi} from './offsets.worker';
import {installInstructionsPanel} from './instructions-panel';
import {installStackHover} from './stack-hover';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions';
import {publishInspections,currentInspections} from './inspection-actions';

import OffsetWorker from './offsets.worker?worker';
import type {SourceOffset} from './offsets.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { registerLanguage } from './language';
import { Runtime } from './runtime';
import {createDetachedHost} from './detached-host';
import {createNavigation,installDefinitionUI} from './navigation';
import { defaultProject, validatePath as relativePath, type Project } from './project';
import { openFolder, parseProperties, pickFolder, newBinding, saveFolder, projectArchive, type FolderBinding, type ClassFileEntry } from './folder-project';
import { installMenus } from './menus';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment';
import type { Compilation } from './protocol';
import './style.css';
import './theme-layouts.css';
import { initializeThemes, openThemePicker, applyTheme } from './themes';
(self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
registerLanguage(()=>navigation.completionCatalog());
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header class="toolbar">
  <div class="brand"><img class="brand-logo" src="./favicon.svg" alt="Javasm ロゴ" width="40" height="40"><h1>JAL<span>Web</span></h1><span class="brand-caption">JVM ASSEMBLY LAB</span></div>
  <div class="toolbar-actions"><button id="stop" class="subtle" disabled>■ Stop</button><button id="run" class="run" title="実行（Ctrl+Enter / F5）"><span aria-hidden="true">▶</span> Run <kbd>Ctrl ↵</kbd></button></div>
</header>
<nav class="menubar" aria-label="メインメニュー"><div id="menus" role="menubar" aria-label="アプリケーションメニュー"></div><span id="project-name"></span></nav>

<input id="class-input" type="file" accept=".class" multiple hidden>
<dialog id="dialog"><form method="dialog"><h2 id="dialog-title"></h2><p id="dialog-message"></p><input id="dialog-input" aria-labelledby="dialog-title" autocomplete="off"><div class="dialog-actions"><button value="cancel" id="dialog-cancel">キャンセル</button><button value="ok" id="dialog-ok">OK</button></div></form></dialog>
<dialog id="project-properties" aria-labelledby="properties-title"><form id="properties-form" method="dialog">
  <h2 id="properties-title">プロジェクトのプロパティ</h2>
  <label for="properties-name">プロジェクト名</label><input id="properties-name" required maxlength="128" autocomplete="off">
  <label for="entry-file">実行するファイル</label><select id="entry-file" required></select>
  <p class="properties-hint">初期設定は src/Main.jal です。main メソッドを持つファイルを選択してください。</p>
  <div class="dialog-actions"><button type="button" id="properties-cancel">キャンセル</button><button type="submit" id="properties-save">適用</button></div>
</form></dialog>
<dialog id="theme-dialog" aria-labelledby="theme-title"><form method="dialog"><h2 id="theme-title">テーマとレイアウト</h2><label for="theme-select">テーマ</label><select id="theme-select"></select><p>変更はすぐに反映され、このブラウザに保存されます。</p><div class="dialog-actions"><button>閉じる</button></div></form></dialog>
<main class="workspace">
  <section class="workspace-summary" aria-label="ワークスペース概要"><div><span class="summary-eyebrow"></span><h2 id="summary-project-name">Main</h2><p>ソースを編集し、ブラウザでビルド・実行。</p></div><button id="summary-properties">プロジェクト設定 ↗</button></section>
  <aside class="project-pane" aria-label="プロジェクト"><div class="project-heading">PROJECT <button id="add-file" class="icon-button" title="ファイルを追加" aria-label="ファイルを追加">+</button></div><div id="file-list" aria-label="ファイル一覧"></div></aside>
  <section class="source-pane" aria-label="JAL ソースエディタ">
    <div class="pane-header source-header"><div id="file-tabs" role="tablist" aria-label="ソースファイル"></div></div>
    <div id="editor"></div>
    <div class="editor-footer"><span id="cursor">Ln 1, Col 1</span><span>UTF-8 <span class="separator">/</span> JAL</span></div>
  </section>
  <section class="output-pane" aria-label="実行結果">
    <div class="pane-header output-header"><div class="tabs" role="tablist" aria-label="実行パネル"><button role="tab" id="console-tab" aria-controls="console-panel" aria-selected="true">Console</button><button role="tab" id="problems-tab" aria-controls="problems-panel" aria-selected="false" tabindex="-1">Problems <span id="problem-count">0</span></button><button role="tab" id="instructions-tab" aria-controls="instructions-panel" aria-selected="false" tabindex="-1">Instructions</button></div><button id="clear" class="icon-button" title="コンソールを消去" aria-label="コンソールを消去">⌫</button></div>
    <div id="console-panel" role="tabpanel" aria-labelledby="console-tab"><div id="console-empty"><span class="terminal-symbol" aria-hidden="true">&gt;_</span><p>コードを書いて、実行しよう。</p><span>Run または Ctrl + Enter</span></div><pre id="output" aria-label="標準出力と標準エラー" tabindex="0"></pre></div>
    <div id="problems-panel" role="tabpanel" aria-labelledby="problems-tab" hidden><p class="empty-problems">文法とスタックを検査しています…</p><ul id="problems"></ul></div>
    <div id="instructions-panel" role="tabpanel" aria-labelledby="instructions-tab" hidden></div>
    <div class="stdin-section"><label for="stdin">STANDARD INPUT <span>実行開始時に読み込み</span></label><textarea id="stdin" spellcheck="false" placeholder="標準入力（任意）" aria-label="標準入力"></textarea></div>
    <div class="runtime-card"><span class="runtime-dot"></span><div><strong>WebAssembly JVM</strong><span>OpenJDK 23 · ブラウザ内で実行</span></div><span class="runtime-label">LOCAL</span></div>
  </section>
</main>
<footer class="statusbar"><div><span id="state-dot" class="status-dot loading"></span><span id="state" role="status" aria-live="polite">JVM を読み込み中…</span></div><span id="instruction-hint">命令ホバーでスタックの変化を表示</span><span id="timing"></span></footer>`;
const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
let project=defaultProject();
interface ClassPreview {key:string;title:string;model:monaco.editor.ITextModel;folderPath?:string;mtime:number;size:number}
const classPreviews=new Map<string,ClassPreview>();let activePreview:string|undefined,previewEpoch=0,dropSequence=0;
const disassembler=new Runtime();let classQueue=Promise.resolve();
let folder:FolderBinding|undefined,storageBusy=false,changeVersion=0,watchBusy=false,applyingExternal=false;
let dirty=false, revision=0, checkedRevision=-1, running=false, runToken=0, disposed=false;
let models=new Map<string,monaco.editor.ITextModel>();
const closedSourceTabs=new Set<string>();
let tabOrder:string[]=[];let restoringLayout=false;
let results=new Map<string,Compilation>();
let problemTargets:{path:string;line:number;column:number}[]=[];
const offsetWorker=new WorkerRpc<OffsetsApi>(()=>new OffsetWorker());
const offsetCache=new WeakMap<monaco.editor.ITextModel,{version:number;offsets:SourceOffset[]}>();
const offsetTimers=new Map<monaco.editor.ITextModel,ReturnType<typeof setTimeout>>();
function scheduleOffsets(model:monaco.editor.ITextModel){
 publishInspections(model,[]);
 clearTimeout(offsetTimers.get(model));offsetTimers.set(model,setTimeout(()=>{
  offsetTimers.delete(model);if(model.isDisposed())return;const version=model.getVersionId();
  void offsetWorker.call(api=>api.analyze(model.getValue())).then(data=>{if(model.isDisposed()||model.getVersionId()!==version)return;offsetCache.set(model,{...data,version});if([...models.values()].includes(model)){publishInspections(model,data.inspections);showDiagnostics();}for(const view of groupEditors.values())if(view.getModel()===model)refreshOffsets(view);}).catch(error=>{if(!disposed)console.error('ソース解析に失敗しました。',error);});
 },80));
}
const compilationCache=new Map<string,{source:string;compilation:Compilation}>();
let analysisPromise:Promise<void>|undefined;
let analysisTimer:ReturnType<typeof setTimeout>;
const compiler=new Runtime();let runner:Runtime|undefined;
const editorOverlays=document.createElement('div');editorOverlays.id='editor-overlays';document.body.append(editorOverlays);
// Theme is global to Monaco; editor options must not override it when groups are created.
initializeThemes();
export let editor=monaco.editor.create(el('editor'),{overflowWidgetsDomNode:editorOverlays,fixedOverflowWidgets:true,automaticLayout:true,fontSize:15,lineHeight:27,
  fontFamily:'"Cascadia Code", "JetBrains Mono", Consolas, monospace',fontLigatures:true,minimap:{enabled:false},
  padding:{top:24,bottom:24},scrollBeyondLastLine:false,tabSize:2,insertSpaces:true,renderLineHighlight:'line',
  overviewRulerBorder:false,hideCursorInOverviewRuler:true,lineNumbersMinChars:10,folding:true,glyphMargin:false,
  wordWrap:'off',ariaLabel:'JAL ソースコード',quickSuggestions:{other:true,comments:false,strings:false}});
const groupEditors=new Map<Side,monaco.editor.IStandaloneCodeEditor>([['source',editor]]);
const sourceGroups=new Map<string,Side>();let activeSide:Side='source';
el('editor').classList.add('group-editor');
const groupResources:monaco.IDisposable[]=[];
const syncOverlayTheme=()=>{editorOverlays.className=editor.getDomNode()!.className;};
const overlayThemeObserver=new MutationObserver(syncOverlayTheme);overlayThemeObserver.observe(editor.getDomNode()!,{attributes:true,attributeFilter:['class']});syncOverlayTheme();
const stackHover=installStackHover(editor,model=>{const path=[...models].find(([,m])=>m===model)?.[0],cached=path?compilationCache.get(path):undefined;return cached?.source===model.getValue()?cached.compilation:undefined;});
const detached=createDetachedHost(key=>{const owner=project;queueMicrotask(()=>{if(disposed||restoringLayout||project!==owner)return;for(const view of groupEditors.values()){const model=view.getModel(),doc=model?detachableDocument(model.uri.toString()):undefined;if(doc&&detached.has(doc.key))view.setModel(null);}
if(key.startsWith('panel:')){panelDock?.show(key.slice(6) as 'project'|'console'|'problems'|'instructions');return;}const current=editor.getModel();if(current&&detached.has(!activePreview?'source:'+project.workspace.activeFile:'preview:'+activePreview)){captureView();activePreview=undefined;editor.setModel(null);}const tab=visibleTabs().find(t=>t.key===key);const next=tab??visibleTabs()[0];if(!editor.getModel()&&next)selectEditorTab(next);else{renderFiles();updateActions();}});},()=>void saveProject(),()=>void run(),{
 resolve:(model,offset)=>navigation.resolve(model,offset),completionCatalog:()=>navigation.completionCatalog(),document:detachableDocument,view:key=>{const doc=detachableDocument(key),view=[...groupEditors.values()].find(v=>v.getModel()===doc?.model),p=view?.getPosition();return p&&view?{line:p.lineNumber,column:p.column,scrollTop:Math.round(view.getScrollTop()),scrollLeft:Math.round(view.getScrollLeft())}:key.startsWith('source:')?project.workspace.views[key.slice(7)]:undefined;},
 state:()=>({tools:{output:[...el('output').children].map(n=>({text:n.textContent??'',stream:n.className})),stdin:el<HTMLTextAreaElement>('stdin').value,problems:[...el('problems').querySelectorAll('button')].map(n=>({label:n.textContent??'',severity:n.className}))},canSave:!!folder&&!storageBusy,running,status:el('state').textContent??'',theme:document.documentElement.dataset.theme??'jal-night',files:[...project.files.map(f=>({key:'source:'+f.path,title:f.path})),...[...classPreviews.values()].map(p=>({key:'preview:'+p.key,title:p.title+' (JAL)'}))]}),
 instruction:op=>{instructionPanel.showInstruction(op);detached.showInstruction(op);},
 panelOpened:name=>panelDock?.close(name),stdin:text=>{el<HTMLTextAreaElement>('stdin').value=text;setDirty();},clearOutput:()=>el('clear').click(),problem:(index,group)=>{const target=problemTargets[index],model=target?models.get(target.path):undefined;if(target&&model)void window.jalwebDetached?.openDefinition(group,model.uri.toString(),model.validatePosition({lineNumber:target.line,column:target.column}));},
 stop:()=>stopRun(),check:()=>{clearTimeout(analysisTimer);void analyze();},theme:id=>applyTheme(id),
 async classFile(model){await analyze();const path=[...models].find(([,m])=>m===model)?.[0],c=path?results.get(path):undefined;if(checkedRevision===revision&&c?.bytecode)return {name:c.className.split('/').pop()+'.class',bytecode:c.bytecode};}
});

const navigation=createNavigation({
 models:()=>[...models.values(),...[...classPreviews.values()].map(p=>p.model)],
 async classBytes(owner){
  const matches=(folder?.classFiles??[]).filter(f=>f.path===owner+'.class'||f.path.endsWith('/'+owner+'.class'));
  if(matches.length!==1)return;const file=await matches[0].handle.getFile();if(file.size>1024*1024)return;return new Uint8Array(await file.arrayBuffer());
 },
 async disassemble(bytes){
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const work=classQueue.then(()=>disassembler.disassemble(btoa(binary)));classQueue=work.then(()=>{},()=>{});return work;
 }
});
const definitionUI=installDefinitionUI((model,offset)=>navigation.resolve(model,offset),openDefinition);
function detachableDocument(keyOrUri:string){
 const source=[...models].find(([path,m])=>'source:'+path===keyOrUri||m.uri.toString()===keyOrUri);
 if(source)return {key:'source:'+source[0],title:source[0],model:source[1],readOnly:false};
 let preview=[...classPreviews.values()].find(p=>'preview:'+p.key===keyOrUri||p.model.uri.toString()===keyOrUri);
 if(!preview){const model=monaco.editor.getModels().find(m=>m.uri.toString()===keyOrUri&&m.uri.authority==='definition');if(!model||model.isDisposed())return;const name=model.uri.path.slice(1).replace(/\.jal$/,'.class');preview={key:'definition:'+name,title:name,model,mtime:0,size:0};classPreviews.set(preview.key,preview);scheduleOffsets(model);}
 return {key:'preview:'+preview.key,title:preview.title+' (JAL)',model:preview.model,readOnly:true};
}
async function openDefinition(uri:string,selection?:monaco.IRange|monaco.IPosition){
 const model=monaco.editor.getModel(monaco.Uri.parse(uri));if(!model||model.isDisposed())return false;
 const source=[...models].find(([,m])=>m===model);
 let key:string;
 if(source){key='source:'+source[0];if(!detached.has(key))switchFile(source[0]);}
 else{
  let preview=[...classPreviews.values()].find(p=>p.model===model);
  if(!preview){if(model.uri.authority!=='definition')return false;const name=model.uri.path.slice(1).replace(/\.jal$/,'.class');preview={key:'definition:'+name,title:name,model,mtime:0,size:0};classPreviews.set(preview.key,preview);scheduleOffsets(model);}
  key='preview:'+preview.key;if(!detached.has(key))selectClassPreview(preview.key);
 }
 if(detached.has(key)){detached.reveal(key,selection);return true;}
 if(selection){const position='startLineNumber' in selection?{lineNumber:selection.startLineNumber,column:selection.startColumn}:selection;editor.setPosition(position);editor.revealPositionInCenter(position);}
 editor.focus();window.focus();return true;
}
let panelDock:ReturnType<typeof installPanelDock>|undefined;
const menus=installMenus(el('menus'),[
  {label:'File',items:[
    {id:'open-class',label:'.class を開く…',action:()=>el<HTMLInputElement>('class-input').click()},
    {id:'close-class',label:'逆アセンブルのタブを閉じる',action:()=>{if(activePreview)closeClassPreview(activePreview);}},
    {id:'save-class-source',label:'逆アセンブルした JAL を保存…',action:()=>{const p=activePreview?classPreviews.get(activePreview):undefined;if(p)download(new Blob([p.model.getValue()],{type:'text/plain;charset=utf-8'}),p.title.replace(/\.class$/i,'.jal'));}},
    {id:'new-project',label:'新規プロジェクト',action:()=>void newProject()},
    {id:'open-project-file',label:'プロジェクトを開く…',action:()=>void openProjectFolder(true)},
    {id:'open-project',label:'フォルダーを開く…',shortcut:'Ctrl+O',action:()=>void openProjectFolder()},
    {id:'save-project',label:'プロジェクトを保存',shortcut:'Ctrl+S',action:()=>void saveProject()},
    {id:'save-project-as',label:'別のフォルダーに保存…',action:()=>void saveProject(true)},
    {id:'export-project',label:'ZIP にエクスポート…',action:()=>void exportProject()},
    {id:'new-file',label:'JAL ファイルを追加…',action:()=>void addFile()},
    {id:'rename-file',label:'ファイル名を変更…',action:()=>void renameFile()},
    {id:'remove-file',label:'ファイルを削除…',action:()=>void removeFile()},
    {id:'project-properties-menu',label:'プロジェクトのプロパティ…',action:openProperties}
  ]},
  {label:'Edit',items:[
    {id:'quick-fix',label:'Quick Fix…',shortcut:'Ctrl+.',action:()=>editAction('editor.action.quickFix')},
    {id:'undo',label:'元に戻す',shortcut:'Ctrl+Z',action:()=>editAction('undo')},
    {id:'redo',label:'やり直す',shortcut:'Ctrl+Y',action:()=>editAction('redo')},
    {id:'find',label:'検索',shortcut:'Ctrl+F',action:()=>editAction('actions.find')},
    {id:'replace',label:'置換',shortcut:'Ctrl+H',action:()=>editAction('editor.action.startFindReplaceAction')},
    {id:'comment',label:'行コメントの切り替え',shortcut:'Ctrl+/',action:()=>editAction('editor.action.commentLine')},
    {id:'theme-settings',label:'テーマとレイアウト…',action:openThemePicker},
    {id:'wrap',label:'折り返しの切り替え',action:()=>{project.workspace.wordWrap=!project.workspace.wordWrap;editor.updateOptions({wordWrap:project.workspace.wordWrap?'on':'off'});setDirty();}}
  ]},
  {label:'View',items:[...(['project','console','problems','instructions'] as const).map(name=>({id:'show-'+name,label:name[0].toUpperCase()+name.slice(1),action:()=>selectTab(name)})),{id:'swap-panes',label:'左右のペインを入れ替える',action:()=>panelDock?.swap()}]},
  {label:'Build',items:[
    {id:'check-project',label:'プロジェクトを検査',action:()=>{clearTimeout(analysisTimer);void analyze();}},
    {id:'menu-run',label:'実行',shortcut:'Ctrl+Enter',action:()=>void run()},
    {id:'menu-stop',label:'停止',action:()=>stopRun()},
    {id:'download',label:'現在のファイルの .class を保存…',action:downloadClass}
  ]},
  {label:'Help',items:[
    {id:'help-project',label:'プロジェクトについて',action:()=>void dialog('プロジェクトについて','File → フォルダーを開くは設定の有無を自動判別し、プロジェクトを開くは .jalprj があるフォルダーを読み込みます。設定なしの場合はソースだけを保存します。約 1 秒ごとに外部の追加・削除・変更を反映します。Ctrl+S で同じフォルダーへ保存します。project.jalprj は名前と実行ファイルの設定だけを持ちます。初期の実行ファイルは src/Main.jal です。対応していないブラウザでは ZIP にエクスポートできます。')},
    {id:'help-shortcuts',label:'操作とショートカット',action:()=>void dialog('操作とショートカット','Ctrl+S: 保存 / Ctrl+O: 開く / Ctrl+Enter・F5: 実行 / Ctrl+Space: 補完 / Ctrl+.: Quick Fix / 命令ホバー: スタックの実行前→実行後 / Ctrl+クリック・F12: クラス／メンバー／ラベルの定義へ移動。メニューは矢印キーと Escape でも操作できます。')},
    {id:'help-about',label:'JALWeb について',action:()=>void dialog('JALWeb','JVM Assembly Language の Web エディタ。Monaco Editor・ANTLR・ASM・Bovine WASM JVM・OpenJDK を使用しています。コードのコンパイルと実行はブラウザ内で行います。')}
  ]}
]);
function status(text:string,kind:'ready'|'loading'|'error'='ready') {el('state').textContent=text;el('state-dot').className=`status-dot ${kind}`;}
function setDirty(value=true) {if(value)changeVersion++;dirty=value;el('project-name').textContent=project.name+(dirty?' •':'');document.title=`${dirty?'• ':''}${project.name} — JALWeb`;el('summary-project-name').textContent=project.name;}
function validatePath(path:string){relativePath(path);if(folder?.properties!==false&&!path.startsWith('src/'))throw new Error('ソースは src/ 以下に置いてください。');}
function refreshOffsets(view=editor){
 const model=view.getModel(),cached=model?offsetCache.get(model):undefined;
 const lines=new Map<number,SourceOffset[]>();
 for(const item of cached?.version===model?.getVersionId()?cached?.offsets??[]:[])lines.set(item.line,[...(lines.get(item.line)??[]),item]);
 const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 view.updateOptions({lineNumbers:line=>{
  const items=lines.get(line)??[],first=items[0];
  const title=first?'バイトコードオフセット（命令解析による推定・10進数）\n'+items.map(i=>`${i.method}: ${i.offset}`).join('\n'):'';
  return `<span class="jal-source-line">${line}</span><span class="jal-bytecode-offset" title="${escape(title)}">${first?first.offset+(items.length>1?'…':''):''}</span>`;
 }});
}
function updateActions() {
  refreshOffsets();
  menus.disabled('rename-file',!!activePreview||!editor.getModel()||!project.files.length);menus.disabled('close-class',!activePreview);menus.disabled('save-class-source',!activePreview);
  menus.disabled('project-properties-menu',folder?.properties===false);el<HTMLButtonElement>('summary-properties').disabled=folder?.properties===false;
  el<HTMLButtonElement>('run').disabled=running;el<HTMLButtonElement>('stop').disabled=!running;
  menus.disabled('menu-run',running);menus.disabled('menu-stop',!running);
  menus.disabled('download',!!activePreview||!editor.getModel()||checkedRevision!==revision || !results.get(project.workspace.activeFile)?.bytecode);
  menus.disabled('remove-file',!!activePreview||!editor.getModel()||project.files.length<=1);
}
function editAction(id:string) {editor.focus();editor.trigger('menu',id,undefined);}
function captureView() {
  if(activePreview)return;
  const p=editor.getPosition();if(!p)return;
  project.workspace.views[project.workspace.activeFile]={line:p.lineNumber,column:p.column,scrollTop:Math.round(editor.getScrollTop()),scrollLeft:Math.round(editor.getScrollLeft())};
}
function switchFile(path:string,saveView=true) {
  if(saveView)captureView();activeSide=sourceGroups.get('source:'+path)??'source';editor=groupEditors.get(activeSide)!;panelDock?.showSource(activeSide);
  if(detached.has('source:'+path)){detached.focus('source:'+path);return;}

  closedSourceTabs.delete(path);activePreview=undefined;editor.updateOptions({readOnly:false});project.workspace.activeFile=path;editor.setModel(models.get(path)??null);
  if(!editor.getModel()){renderFiles();updateActions();return;}
  const v=project.workspace.views[path];
  editor.setPosition(editor.getModel()!.validatePosition({lineNumber:v?.line??1,column:v?.column??1}));
  editor.setScrollPosition({scrollTop:v?.scrollTop??0,scrollLeft:v?.scrollLeft??0});
  renderFiles();updateActions();
}
const collapsedFolders=new Set<string>();
function renderFiles() {
  const list=el('file-list');list.replaceChildren();document.querySelectorAll('.workspace .editor-tab').forEach(n=>n.remove());
  renderProjectTree(list,[...project.files.map(f=>({path:f.path,key:'source:'+f.path,active:!!editor.getModel()&&!activePreview&&f.path===project.workspace.activeFile,open:()=>switchFile(f.path)})),...(folder?.classFiles??[]).map(f=>({path:f.path,key:'',active:activePreview==='folder:'+f.path,open:()=>queueClass(()=>f.handle.getFile(),'folder:'+f.path,f.path,true,f.path)}))],window.jalwebDetached!.workspaceId,collapsedFolders);
  for(const tab of visibleTabs())renderEditorTab(tab);
  panelDock?.refresh();
}
function attachModel(path:string,source:string) {
  const model=monaco.editor.createModel(source,'jal',monaco.Uri.from({scheme:'inmemory',authority:'jal',path:'/'+path}));
  model.onDidChangeContent(()=>{scheduleOffsets(model);if(!applyingExternal){invalidate();setDirty();}});models.set(path,model);scheduleOffsets(model);return model;
}
function invalidate() {revision++;checkedRevision=-1;updateActions();clearTimeout(analysisTimer);analysisTimer=setTimeout(()=>void analyze(),500);}
async function installProject(next:Project,binding?:FolderBinding) {
 restoringLayout=true;detached.closeAll();panelDock?.restore();navigation.reset();tabOrder=[];collapsedFolders.clear();sourceGroups.clear();for(const view of groupEditors.values())view.setModel(null);activeSide='source';editor=groupEditors.get('source')!;

  previewEpoch++;disassembler.stop();for(const p of classPreviews.values())p.model.dispose();classPreviews.clear();activePreview=undefined;
  folder=binding;
  stopRun(false);clearTimeout(analysisTimer);revision++;checkedRevision=-1;
  editor.setModel(null);for(const model of models.values())model.dispose();models=new Map();
  project=next;closedSourceTabs.clear();results.clear();compilationCache.clear();
  for(const f of project.files)attachModel(f.path,f.source);
  editor.updateOptions({wordWrap:project.workspace.wordWrap?'on':'off'});
  if(project.workspace.layout)await restorePreviewTabs(project.workspace.layout);if(project!==next)return;
  switchFile(project.workspace.activeFile,false);el<HTMLTextAreaElement>('stdin').value=project.workspace.stdin;
  selectTab(project.workspace.panel);if(project.workspace.layout)restoreWorkspace(project.workspace.layout);queueMicrotask(()=>{restoringLayout=false;});el('clear').click();el('timing').textContent='';setDirty(false);showDiagnostics();void analyze();
}
function captureWorkspace():WorkspaceLayout {
 const selected:WorkspaceLayout['selected']={},views={...project.workspace.views};
 for(const [side,view] of groupEditors){const model=view.getModel(),doc=model?detachableDocument(model.uri.toString()):undefined;if(!doc)continue;selected[side]=doc.key;const p=view.getPosition();if(p)views[doc.key.startsWith('source:')?doc.key.slice(7):doc.key]={line:p.lineNumber,column:p.column,scrollTop:Math.round(view.getScrollTop()),scrollLeft:Math.round(view.getScrollLeft())};}
 const windows=detached.snapshot();for(const w of windows)for(const [key,v] of Object.entries(w.views))views[key.startsWith('source:')?key.slice(7):key]=v;
 const keys=[...visibleTabs().map(t=>t.key),...windows.flatMap(w=>w.tabs)];
 return {version:1,order:[...tabOrder],tabs:[...new Set(keys)].sort((a,b)=>tabOrder.indexOf(a)-tabOrder.indexOf(b)).map(key=>({key,side:sourceGroups.get(key)??'source'})),selected,activeSide,collapsedFolders:[...collapsedFolders],dock:panelDock!.snapshot(),windows,views,wordWrap:project.workspace.wordWrap};
}
async function restorePreviewTabs(layout:WorkspaceLayout){
 const owner=project,epoch=previewEpoch;
 for(const key of new Set([...layout.tabs.map(t=>t.key),...layout.windows.flatMap(w=>w.tabs)])){
  if(key.startsWith('preview:folder:')){const path=key.slice('preview:folder:'.length),file=folder?.classFiles?.find(f=>f.path===path);if(file)await queueClass(()=>file.handle.getFile(),'folder:'+path,path,false,path,true);}
  else if(key.startsWith('preview:definition:')){try{const name=key.slice('preview:definition:'.length),model=await navigation.classModel(name.replace(/\.class$/,''));if(project!==owner||epoch!==previewEpoch)return;if(model){classPreviews.set(key.slice(8),{key:key.slice(8),title:name,model,mtime:0,size:0});scheduleOffsets(model);}}catch{}}
  if(project!==owner||epoch!==previewEpoch)return;
 }
}
function restoreWorkspace(layout:WorkspaceLayout){
 const available=(key:string)=>key.startsWith('source:')&&models.has(key.slice(7))||key.startsWith('preview:')&&classPreviews.has(key.slice(8));
 const tabs=layout.tabs.filter(t=>available(t.key));tabOrder=layout.order?[...layout.order]:tabs.map(t=>t.key);sourceGroups.clear();for(const t of tabs)sourceGroups.set(t.key,t.side);
 closedSourceTabs.clear();for(const f of project.files)if(!tabs.some(t=>t.key==='source:'+f.path))closedSourceTabs.add(f.path);
 collapsedFolders.clear();for(const path of layout.collapsedFolders)collapsedFolders.add(path);
 panelDock!.restore(layout.dock);
 detached.restore(layout.windows.map(w=>({...w,tabs:w.tabs.filter(available)})));
 for(const side of layoutSides){const view=groupEditors.get(side)!;view.setModel(null);view.updateOptions({wordWrap:layout.wordWrap?'on':'off'});const key=layout.selected[side],tab=tabs.find(t=>t.side===side&&t.key===key&&!detached.has(t.key))??tabs.find(t=>t.side===side&&!detached.has(t.key));if(!tab)continue;const doc=detachableDocument(tab.key);if(!doc)continue;view.setModel(doc.model);view.updateOptions({readOnly:doc.readOnly});const v=layout.views[tab.key.startsWith('source:')?tab.key.slice(7):tab.key];if(v){view.setPosition(doc.model.validatePosition({lineNumber:v.line,column:v.column}));view.setScrollPosition({scrollTop:v.scrollTop,scrollLeft:v.scrollLeft});}}
 activeSide=layout.activeSide;editor=groupEditors.get(activeSide)!;const model=editor.getModel();activePreview=[...classPreviews.values()].find(p=>p.model===model)?.key;const path=[...models].find(([,m])=>m===model)?.[0];if(path)project.workspace.activeFile=path;
 renderFiles();updateActions();
}
function snapshot():Project {
  const layout=captureWorkspace();return {...project,files:project.files.map(f=>({path:f.path,source:models.get(f.path)!.getValue()})),workspace:{...project.workspace,layout,stdin:el<HTMLTextAreaElement>('stdin').value}};
}
function download(blob:Blob,name:string) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function storageState(busy:boolean){storageBusy=busy;if(busy)status('ファイルを処理中…','loading');for(const id of ['new-project','open-project','open-project-file','save-project','save-project-as','export-project'])menus.disabled(id,busy);}
function storageError(e:unknown,title:string){if(e instanceof Error&&e.name==='AbortError'){status('キャンセルしました');return;}status(title,'error');void dialog(title,e instanceof Error?e.message:String(e));}
async function openProjectFolder(requireProperties=false){
  if(storageBusy)return;storageState(true);
  try{const root=await pickFolder();const loaded=await openFolder(root,requireProperties);if(await allowReplace())await installProject(loaded.project,loaded.binding);else status('キャンセルしました');}
  catch(e){storageError(e,'フォルダーを開けませんでした');}finally{storageState(false);}
}
async function saveProject(saveAs=false){
  if(storageBusy)return;storageState(true);
  try{
    const target=(!folder||saveAs)?{...newBinding(await pickFolder()),properties:folder?.properties??true}:folder;
    while(watchBusy)await new Promise(resolve=>setTimeout(resolve,20));
    const version=changeVersion,current=project,copy=snapshot();
    try{await saveFolder(target,copy);}catch(e){if(!folder&&target.baseline.size)folder=target;throw e;}
    folder=target;
    if(project===current&&changeVersion===version)setDirty(false);
    status(changeVersion===version?'フォルダーに保存しました':'保存しました（その後の変更は未保存です）');
  }catch(e){storageError(e,'保存できませんでした');}finally{storageState(false);}
}
async function exportProject(){
  if(storageBusy)return;storageState(true);
  try{const bytes=await projectArchive(snapshot(),folder?.properties!==false);const name=project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'Project';download(new Blob([new Uint8Array(bytes)],{type:'application/zip'}),name+'.zip');status('ZIP をエクスポートしました');}
  catch(e){storageError(e,'エクスポートできませんでした');}finally{storageState(false);}
}

async function pollFolder(){
 if(!folder||storageBusy||watchBusy||disposed)return;
 watchBusy=true;const binding=folder;
 try{
  const disk=await openFolder(binding.root,false,binding);
  if(folder!==binding||storageBusy||disposed)return;
  let changed=false,sourcesChanged=false;const conflicts:string[]=[];const remote=disk.binding.baseline;
  captureView();applyingExternal=true;
  for(const path of new Set([...binding.baseline.keys(),...remote.keys()])){
   const old=binding.baseline.get(path),next=remote.get(path);
   if(old===next)continue;
   if(!path.endsWith('.jal')){
    const localProperties=JSON.stringify({name:project.name,entryFile:project.workspace.entryFile});
    let beforeProperties=localProperties;
    if(old){const p=parseProperties(old);beforeProperties=JSON.stringify({name:p.name,entryFile:p.entryFile});}
    if(localProperties!==beforeProperties){conflicts.push(path);continue;}
    project.name=disk.project.name;project.workspace.entryFile=disk.project.workspace.entryFile;
   }else{
    sourcesChanged=true;const model=models.get(path),local=model?.getValue();
    if(local!==old&&local!==next){conflicts.push(path);continue;}
    if(next===undefined){
     if(editor.getModel()===model)editor.setModel(null);
     model?.dispose();models.delete(path);closedSourceTabs.delete(path);project.files=project.files.filter(f=>f.path!==path);
     results.delete(path);compilationCache.delete(path);delete project.workspace.views[path];
    }else if(model){model.setValue(next);project.files.find(f=>f.path===path)!.source=next;}
    else{attachModel(path,next);project.files.push({path,source:next});}
   }
   if(next===undefined)binding.baseline.delete(path);else binding.baseline.set(path,next);
   changed=true;
  }
  syncClassFiles(binding,disk.binding.classFiles??[]);
  binding.cache=disk.binding.cache;binding.properties=disk.binding.properties;binding.configName=disk.binding.configName;
  if(changed){
   project.files.sort((a,b)=>a.path.localeCompare(b.path));
   if(binding.properties===false&&!models.has(project.workspace.entryFile))project.workspace.entryFile=disk.project.workspace.entryFile;
   const active=models.has(project.workspace.activeFile)?project.workspace.activeFile:project.files[0]?.path??'';
   if(!sourcesChanged||activePreview||closedSourceTabs.has(active)||detached.has('source:'+active))renderFiles();else switchFile(active,false);setDirty(dirty);invalidate();
   if(!running)status('フォルダーの変更を反映しました');
  }
  if(conflicts.length)status(`外部変更と編集中の内容が競合しています: ${conflicts.join(', ')}（編集内容を保持）`,'error');
 }catch(e){if(folder===binding&&!storageBusy)status(`フォルダーの監視: ${e instanceof Error?e.message:String(e)}`,'error');}
 finally{applyingExternal=false;watchBusy=false;}
}
const folderWatch=setInterval(()=>void pollFolder(),1000);

function selectClassPreview(key:string){
 if(detached.has('preview:'+key)){detached.focus('preview:'+key);return;}

 captureView();activeSide=sourceGroups.get('preview:'+key)??'source';editor=groupEditors.get(activeSide)!;panelDock?.showSource(activeSide);const preview=classPreviews.get(key);if(!preview)return;activePreview=key;editor.setModel(preview.model);editor.updateOptions({readOnly:true});renderFiles();updateActions();
}
interface EditorTab {key:string;label:string;active:boolean;sourcePath?:string;previewKey?:string}
function visibleTabs():EditorTab[]{
 const tabs:EditorTab[]=[
  ...project.files.filter(f=>!closedSourceTabs.has(f.path)).map(f=>({key:'source:'+f.path,label:f.path,sourcePath:f.path,active:!activePreview&&editor.getModel()===models.get(f.path)})),
  ...[...classPreviews.values()].map(p=>({key:'preview:'+p.key,label:p.title+' (JAL)',previewKey:p.key,active:activePreview===p.key}))
 ];
 for(const tab of tabs)if(!tabOrder.includes(tab.key))tabOrder.push(tab.key);
 return tabs.filter(t=>!detached.has(t.key)).sort((a,b)=>tabOrder.indexOf(a.key)-tabOrder.indexOf(b.key));
}
function selectEditorTab(tab:EditorTab){if(tab.sourcePath!==undefined)switchFile(tab.sourcePath);else selectClassPreview(tab.previewKey!);}
function closeEditorTabs(key:string,others=false){
 const side=sourceGroups.get(key)??'source';const tabs=visibleTabs().filter(t=>(sourceGroups.get(t.key)??'source')===side),index=tabs.findIndex(t=>t.key===key);if(index<0)return;
 const removed=tabs.filter(t=>others?t.key!==key:t.key===key),remaining=tabs.filter(t=>!removed.includes(t));
 const next=others?tabs[index]:remaining.find(t=>t.active)??remaining[Math.min(index,remaining.length-1)];
 captureView();
 for(const tab of removed){
  if(groupEditors.get(side)?.getModel()===(tab.sourcePath!==undefined?models.get(tab.sourcePath):classPreviews.get(tab.previewKey!)?.model))groupEditors.get(side)!.setModel(null);
  if(tab.sourcePath!==undefined)closedSourceTabs.add(tab.sourcePath);
  else {const p=classPreviews.get(tab.previewKey!);if(p){if(editor.getModel()===p.model)editor.setModel(null);classPreviews.delete(p.key);if(p.model.uri.authority!=='definition')p.model.dispose();}}
 }
 if(next)selectEditorTab(next);
 else{groupEditors.get(side)!.setModel(null);if(activeSide===side)activePreview=undefined;renderFiles();updateActions();}
}
function closeClassPreview(key:string){closeEditorTabs('preview:'+key);}
function renderEditorTab(item:EditorTab){
 const side=sourceGroups.get(item.key)??'source';const view=groupEditors.get(side)!;item.active=view.getModel()===(item.sourcePath!==undefined?models.get(item.sourcePath):classPreviews.get(item.previewKey!)?.model);
 const pane=new EditorPane(item.key,item.label,{select:()=>selectEditorTab(item),close:others=>{if(others)panelDock?.closeTools(side);closeEditorTabs(item.key,others);}});
 const {wrapper}=paneTab(pane,window.jalwebDetached!.workspaceId,item.active);(panelDock?.strips[side]??el('file-tabs')).append(wrapper);
}
function detachEditorTab(item:EditorTab){
 const model=item.sourcePath!==undefined?models.get(item.sourcePath):classPreviews.get(item.previewKey!)?.model;
 if(!model||model.isDisposed())return;
 if(!detached.open(item.key,item.label,model,item.previewKey!==undefined)){
  status('小窓がブロックされました。「小窓で開く」をクリックしてください。','error');
  document.getElementById('detach-retry')?.remove();const retry=document.createElement('button');retry.id='detach-retry';retry.textContent='小窓で開く';retry.onclick=()=>{retry.remove();detachEditorTab(item);};document.querySelector('.source-header')!.append(retry);return;
 }
 document.getElementById('detach-retry')?.remove();captureView();
 const side=sourceGroups.get(item.key)??'source';const view=groupEditors.get(side)!;if(view.getModel()===model){view.setModel(null);const next=visibleTabs().find(t=>(sourceGroups.get(t.key)??'source')===side);if(next)selectEditorTab(next);else if(activeSide===side)activePreview=undefined;}
 renderFiles();updateActions();status('小窓で開きました。編集内容はワークスペースと共有されます。');
}
function movePane(key:string,side:Side,event:DragEvent){
 const pane=paneIdentity(key);if(!pane)return;
 const before=beforePane(panelDock!.strips[side],key,event.clientX);movePaneOrder(tabOrder,key,before);
 if(pane.kind==='tool'){detached.returnPanel(pane.name);panelDock!.move(pane.name,side);}else moveSource(key,side);
}
function moveSource(key:string,side:Side){
 const doc=detachableDocument(key);if(!doc)return;
 const transferred=detached.has(key)?detached.returnTab(key):undefined;if(transferred&&key.startsWith('source:'))project.workspace.views[key.slice(7)]=transferred;
 const old=sourceGroups.get(key)??'source';sourceGroups.set(key,side);
 if(old!==side&&groupEditors.get(old)?.getModel()===doc.model){groupEditors.get(old)!.setModel(null);const next=visibleTabs().find(t=>(sourceGroups.get(t.key)??'source')===old&&t.key!==key);if(next)selectEditorTab(next);}
 if(key.startsWith('source:'))switchFile(key.slice(7));else {selectClassPreview(key.slice(8));if(transferred){editor.setPosition({lineNumber:transferred.line,column:transferred.column});editor.setScrollPosition({scrollTop:transferred.scrollTop,scrollLeft:transferred.scrollLeft});}}
 editor.focus();
}
function bindGroupEditor(view:monaco.editor.IStandaloneCodeEditor,side:Side){
 view.onDidFocusEditorText(()=>{if(editor===view)return;captureView();editor=view;activeSide=side;const model=view.getModel(),path=[...models].find(([,m])=>m===model)?.[0];if(path){project.workspace.activeFile=path;activePreview=undefined;}else activePreview=[...classPreviews.values()].find(p=>p.model===model)?.key;renderFiles();updateActions();});
 view.onDidChangeModel(()=>refreshOffsets(view));
 if(side==='source')return;
 groupResources.push(installStackHover(view,model=>{const path=[...models].find(([,m])=>m===model)?.[0],cached=path?compilationCache.get(path):undefined;return cached?.source===model.getValue()?cached.compilation:undefined;}),followInstructionClicks(view,op=>{instructionPanel.showInstruction(op);detached.showInstruction(op);}));
 view.onDidChangeCursorPosition(({position})=>{el('cursor').textContent=`Ln ${position.lineNumber}, Col ${position.column}`;});
 view.addAction({id:'jal.run',label:'JAL: Run',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter,monaco.KeyCode.F5],run:()=>run()});
}

function queueClass(getFile:()=>Promise<File>,key:string,title:string,select=true,folderPath?:string,silent=false){
 const epoch=previewEpoch;
 classQueue=classQueue.then(async()=>{
  if(epoch!==previewEpoch)return;
  try{
   const file=await getFile();if(file.size>1024*1024)throw new Error('.class は 1 MiB 以下にしてください。');
   const old=classPreviews.get(key);if(old&&old.mtime===file.lastModified&&old.size===file.size){if(select)selectClassPreview(key);return;}
   if(!old&&classPreviews.size>=16)throw new Error('逆アセンブルのタブは 16 個までです。File メニューからタブを閉じてください。');
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(bytes.length<10||bytes[0]!==0xca||bytes[1]!==0xfe||bytes[2]!==0xba||bytes[3]!==0xbe)throw new Error('有効な Java class ファイルではありません。');
   let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   if(!silent)status(title+' を逆アセンブル中…','loading');const result=await disassembler.disassemble(btoa(binary));
   if(epoch!==previewEpoch||old&&classPreviews.get(key)!==old||folderPath&&!folder?.classFiles?.some(f=>f.path===folderPath))return;
   if(typeof result.source!=='string'||new TextEncoder().encode(result.source).length>1024*1024)throw new Error('逆アセンブル結果が大きすぎます。');
   const model=old?.model??monaco.editor.createModel(result.source,'jal',monaco.Uri.from({scheme:'inmemory',authority:'class-preview',path:'/'+(++dropSequence)+'.jal'}));
   if(old)model.setValue(result.source);
   classPreviews.set(key,{key,title,model,folderPath,mtime:file.lastModified,size:file.size});scheduleOffsets(model);
   if(select||activePreview===key)selectClassPreview(key);else if(!silent)renderFiles();if(!silent)status('逆アセンブルしました（閲覧専用）');
  }catch(e){if(!silent&&epoch===previewEpoch){status('逆アセンブルできませんでした','error');await dialog(title+' を開けませんでした',e instanceof Error?e.message:String(e));}}
 });return classQueue;
}
function syncClassFiles(binding:FolderBinding,files:ClassFileEntry[]){
 const previous=binding.classFiles??[];binding.classFiles=files;
 for(const p of [...classPreviews.values()])if(p.folderPath){const next=files.find(f=>f.path===p.folderPath);if(!next)closeClassPreview(p.key);else if(next.mtime!==p.mtime||next.size!==p.size)queueClass(()=>next.handle.getFile(),p.key,p.title,false,p.folderPath);}
 if(previous.length!==files.length||previous.some((f,i)=>f.path!==files[i]?.path))renderFiles();
}
function openDroppedClasses(files:File[]){
 const classes=files.filter(f=>/\.class$/i.test(f.name));
 if(classes.length>16){void dialog('ファイルが多すぎます','一度に開ける .class は 16 個までです。');return;}
 for(const file of classes)queueClass(async()=>file,'drop:'+ (++dropSequence),file.name);
}
el<HTMLInputElement>('class-input').onchange=()=>{const input=el<HTMLInputElement>('class-input');openDroppedClasses([...input.files??[]]);input.value='';};
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
window.addEventListener('drop',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();openDroppedClasses([...e.dataTransfer.files]);}});

function downloadClass() {
  const c=results.get(project.workspace.activeFile);if(checkedRevision!==revision || !c?.bytecode)return;
  download(new Blob([Uint8Array.from(atob(c.bytecode),x=>x.charCodeAt(0))],{type:'application/java-vm'}),c.className.split('/').pop()+'.class');
}
function dialog(title:string,message:string,input?:string,confirm=false):Promise<string|null> {
  const d=el<HTMLDialogElement>('dialog');if(d.open)return Promise.resolve(null);
  el('dialog-title').textContent=title;el('dialog-message').textContent=message;
  const field=el<HTMLInputElement>('dialog-input');field.hidden=input===undefined;field.value=input??'';
  el('dialog-cancel').hidden=input===undefined&&!confirm;
  el('dialog-ok').textContent=confirm?'変更を破棄して続ける':'OK';d.returnValue='';d.showModal();
  if(input!==undefined){field.focus();field.select();}else el(confirm?'dialog-cancel':'dialog-ok').focus();
  return new Promise(resolve=>d.addEventListener('close',()=>resolve(d.returnValue==='ok'?field.value:null),{once:true}));
}
async function allowReplace() {return !dirty || await dialog('未保存の変更があります','現在の変更を破棄して続けますか？ 保存する場合はキャンセルし、File → 保存を選んでください。',undefined,true)!==null;}
async function newProject() {if(!storageBusy&&await allowReplace())await installProject(defaultProject());}
function openProperties() {
  const d=el<HTMLDialogElement>('project-properties');if(d.open)return;
  el<HTMLInputElement>('properties-name').value=project.name;
  el<HTMLInputElement>('properties-name').setCustomValidity('');
  const select=el<HTMLSelectElement>('entry-file');select.replaceChildren();
  for(const file of project.files){const option=document.createElement('option');option.value=file.path;option.textContent=file.path;select.append(option);}
  select.value=project.workspace.entryFile;d.showModal();el('properties-name').focus();
}
el('summary-properties').onclick=openProperties;
el('properties-cancel').onclick=()=>el<HTMLDialogElement>('project-properties').close();
el('properties-form').onsubmit=e=>{
  e.preventDefault();const field=el<HTMLInputElement>('properties-name'),name=field.value.trim();
  field.setCustomValidity(name?'':'プロジェクト名を入力してください。');if(!field.reportValidity())return;
  const entry=el<HTMLSelectElement>('entry-file').value;
  if(!project.files.some(f=>f.path===entry))return;
  if(project.name!==name||project.workspace.entryFile!==entry){project.name=name;project.workspace.entryFile=entry;setDirty();}
  el<HTMLDialogElement>('project-properties').close();
};
el<HTMLInputElement>('properties-name').oninput=()=>el<HTMLInputElement>('properties-name').setCustomValidity('');
async function addFile() {
  const path=await dialog('JAL ファイルを追加','相対パスを入力してください（例: src/Helper.jal）。','src/Helper.jal');if(path===null)return;
  try {validatePath(path);if(project.files.length>=64)throw new Error('ファイルは 64 個までです。');if(project.files.some(f=>f.path.toLowerCase()===path.toLowerCase()))throw new Error('同じファイル名が存在します。');}
  catch(e){await dialog('追加できませんでした',String(e instanceof Error?e.message:e));return;}
  const className=path.replace(/^src\//,'').slice(0,-4).replace(/[^a-zA-Z0-9_$/]/g,'_').replace(/(^|\/)(?=\d)/g,'$1_');
  if(!project.files.length)project.workspace.entryFile=path;
  project.files.push({path,source:`public class ${className} {\n}\n`});attachModel(path,project.files.at(-1)!.source);switchFile(path);invalidate();setDirty();editor.focus();
}
async function renameFile() {
  if(activePreview||!project.files.length)return;
  const old=project.workspace.activeFile,path=await dialog('ファイル名を変更','クラス名・参照はソース内で変更してください。',old);if(path===null||path===old)return;
  try {validatePath(path);if(project.files.some(f=>f.path!==old&&f.path.toLowerCase()===path.toLowerCase()))throw new Error('同じファイル名が存在します。');}
  catch(e){await dialog('変更できませんでした',String(e instanceof Error?e.message:e));return;}
  captureView();closedSourceTabs.delete(old);const source=models.get(old)!.getValue();editor.setModel(null);models.get(old)!.dispose();models.delete(old);attachModel(path,source);
  project.files.find(f=>f.path===old)!.path=path;
  if(project.workspace.entryFile===old)project.workspace.entryFile=path;
  if(project.workspace.views[old])project.workspace.views[path]=project.workspace.views[old];delete project.workspace.views[old];
  compilationCache.delete(old);results.delete(old);switchFile(path,false);invalidate();setDirty();
}
async function removeFile() {
  if(activePreview)return;
  if(project.files.length<=1)return;const path=project.workspace.activeFile;
  if(await dialog('ファイルを削除',`${path} をプロジェクトから削除します。`,undefined,true)===null)return;
  project.files=project.files.filter(f=>f.path!==path);
  if(project.workspace.entryFile===path)project.workspace.entryFile=project.files[0].path;
  switchFile(project.files[0].path);models.get(path)!.dispose();models.delete(path);results.delete(path);compilationCache.delete(path);delete project.workspace.views[path];invalidate();setDirty();
}
el('add-file').onclick=()=>void addFile();
el<HTMLTextAreaElement>('stdin').oninput=()=>setDirty();
function output(text:string,stream='stdout') {el('console-empty').hidden=true;const span=document.createElement('span');span.className=stream;span.textContent=text;el('output').append(span);const scroller=document.querySelector<HTMLElement>('.dock-console-body')??el('console-panel');scroller.scrollTop=scroller.scrollHeight;}
const instructionPanel=installInstructionsPanel(el('instructions-panel'));
const instructionClicks=followInstructionClicks(editor,op=>{instructionPanel.showInstruction(op);detached.showInstruction(op);});
panelDock=installPanelDock(name=>{project.workspace.panel=name;},()=>{for(const view of groupEditors.values())view.layout();},side=>{for(const tab of visibleTabs().filter(t=>(sourceGroups.get(t.key)??'source')===side))closeEditorTabs(tab.key);},name=>{if(!detached.openPanel(name))status('小窓がブロックされました。右クリックの「小窓で開く」から再度開いてください。','error');},window.jalwebDetached!.workspaceId,()=>tabOrder);
for(const side of ['project','output'] as const){const container=document.createElement('div');container.className='group-editor';container.hidden=true;panelDock.panes[side].append(container);const view=monaco.editor.create(container,{...editor.getRawOptions(),model:null,automaticLayout:true,ariaLabel:side+' グループの JAL ソースコード'});groupEditors.set(side,view);bindGroupEditor(view,side);}
bindGroupEditor(groupEditors.get('source')!,'source');
for(const side of ['project','source','output'] as const)groupResources.push(paneDrop(panelDock.panes[side],window.jalwebDetached!.workspaceId,(key,event)=>movePane(key,side,event)));
groupResources.push(paneDrop(document.body,window.jalwebDetached!.workspaceId,key=>{const pane=paneIdentity(key);if(pane?.kind==='tool'){if(!detached.hasPanel(pane.name))detached.openPanel(pane.name);}else if(pane?.kind==='editor'){const tab=visibleTabs().find(t=>t.key===key);if(tab)detachEditorTab(tab);}}));
function selectTab(tab:'project'|'console'|'problems'|'instructions'){if(detached.hasPanel(tab))detached.focusPanel(tab);else panelDock?.show(tab);}
el('clear').onclick=()=>{el('output').textContent='';el('console-empty').hidden=false;};
function showDiagnostics() {
  el('problems').replaceChildren();problemTargets=[];let count=0;
  for(const [path,model] of models) {
    const items=results.get(path)?.diagnostics??[];count+=items.length;
    monaco.editor.setModelMarkers(model,'jal',items.map(d=>{
      const p=model.validatePosition({lineNumber:d.line,column:d.column});
      return {severity:d.severity==='error'?monaco.MarkerSeverity.Error:monaco.MarkerSeverity.Warning,message:d.message,startLineNumber:p.lineNumber,startColumn:p.column,endLineNumber:p.lineNumber,endColumn:Math.min(model.getLineMaxColumn(p.lineNumber),p.column+Math.max(1,d.length)),source:'JAL'};
    }));
    const inspections=currentInspections(model).map(i=>{const p=model.getPositionAt(i.start);return {message:i.message,severity:i.severity,line:p.lineNumber,column:p.column};});count+=inspections.length;
    for(const d of [...items,...inspections]) {
      problemTargets.push({path,line:d.line,column:d.column});
      const li=document.createElement('li'),b=document.createElement('button');b.className=d.severity;b.textContent=`${path}:${d.line}:${d.column}  ${d.message}`;
      b.onclick=()=>{if(detached.has('source:'+path)){detached.focus('source:'+path);return;}switchFile(path);editor.setPosition(model.validatePosition({lineNumber:d.line,column:d.column}));editor.revealLineInCenter(d.line);editor.focus();};li.append(b);el('problems').append(li);
    }
  }
  el('problem-count').textContent=String(count);const empty=document.querySelector<HTMLElement>('.empty-problems')!;empty.hidden=count>0;empty.textContent='問題は見つかりませんでした。';
}
function hasErrors() {return [...results.values()].some(c=>c.diagnostics.some(d=>d.severity==='error'));}
compiler.onProgress=loaded=>{if(!running)status(`JVM を読み込み中… ${(loaded/1024/1024).toFixed(1)} MB`,'loading');};
async function analyze():Promise<void> {
  if(disposed)return;if(analysisPromise)return analysisPromise;
  analysisPromise=(async()=>{
    let checked=-1;
    while(checked!==revision&&!disposed) {
      checked=revision;const sources=[...models].map(([path,m])=>({path,source:m.getValue()}));
      if(!running)status('文法とスタックを検査中…','loading');
      try {
        const next=new Map<string,Compilation>();
        for(const f of sources) {
          const previous=compilationCache.get(f.path);
          const c=previous?.source===f.source?previous.compilation:await compiler.compile(f.source);
          if(checked!==revision)break;
          compilationCache.set(f.path,{source:f.source,compilation:c});next.set(f.path,{...c,diagnostics:[...c.diagnostics]});
        }
        if(checked!==revision)continue;
        const classes=new Map<string,string[]>();
        for(const [path,c] of next)if(c.bytecode)classes.set(c.className,[...(classes.get(c.className)??[]),path]);
        for(const [name,paths] of classes)if(paths.length>1)for(const path of paths)next.get(path)!.diagnostics.push({severity:'error',message:`クラス ${name} が重複しています: ${paths.join(', ')}`,line:1,column:1,length:1});
        results=next;checkedRevision=checked;showDiagnostics();updateActions();
        if(!running)status(hasErrors()?'コンパイルエラー':'実行できます',hasErrors()?'error':'ready');
      }catch(e){if(checked!==revision)continue;checkedRevision=-1;updateActions();if(!running)status(e instanceof Error?e.message:String(e),'error');break;}
    }
  })().finally(()=>{analysisPromise=undefined;});return analysisPromise;
}
editor.onDidChangeCursorPosition(({position})=>{
  el('cursor').textContent=`Ln ${position.lineNumber}, Col ${position.column}`;
  el('instruction-hint').textContent='命令ホバーでスタックの変化を表示';
});
function stopRun(show=true) {runToken++;runner?.stop();runner=undefined;running=false;updateActions();if(show)status('停止しました');}
async function run() {
  if(running)return;running=true;const token=++runToken;updateActions();let owned:Runtime|undefined;const started=performance.now();
  el('clear').click();el('console-empty').hidden=true;selectTab('console');status('コンパイル中…','loading');
  try {
    clearTimeout(analysisTimer);await analyze();if(token!==runToken)return;
    if(checkedRevision!==revision)throw new Error('コンパイルを完了できませんでした。再度 Run を押してください。');
    if(hasErrors()){selectTab('problems');status('コンパイルエラー','error');return;}
    const entry=results.get(project.workspace.entryFile);if(!entry?.bytecode)throw new Error('実行対象をコンパイルできませんでした。');
    owned=new Runtime();runner=owned;owned.onOutput=(stream,text)=>{if(token===runToken)output(text,stream);};owned.onProgress=loaded=>{if(token===runToken)status(`実行用 JVM を準備中… ${(loaded/1024/1024).toFixed(1)} MB`,'loading');};
    await owned.run({...entry,classes:[...results.values()].map(c=>({className:c.className,bytecode:c.bytecode}))},el<HTMLTextAreaElement>('stdin').value);
    if(token===runToken){status('実行が完了しました');el('timing').textContent=`${((performance.now()-started)/1000).toFixed(2)} s`;}
  }catch(e){if(token===runToken){output(`${e instanceof Error?e.message:String(e)}\n`,'stderr');status('実行に失敗しました','error');}}
  finally {owned?.stop();if(token===runToken){runner=undefined;running=false;updateActions();}}
}
el('run').onclick=()=>void run();el('stop').onclick=()=>stopRun();
editor.addAction({id:'jal.run',label:'JAL: Run',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter,monaco.KeyCode.F5],run:()=>run()});
window.addEventListener('keydown',e=>{if(el<HTMLDialogElement>('theme-dialog').open||el<HTMLDialogElement>('dialog').open||el<HTMLDialogElement>('project-properties').open)return;if((e.ctrlKey||e.metaKey)&&!e.altKey){if(e.key.toLowerCase()==='s'){e.preventDefault();void saveProject();}else if(e.key.toLowerCase()==='o'){e.preventDefault();void openProjectFolder();}}});
window.addEventListener('beforeunload',e=>{if(dirty||storageBusy){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{disposed=true;for(const resource of groupResources)resource.dispose();for(const view of groupEditors.values())if(view!==editor)view.dispose();instructionClicks.dispose();instructionPanel.dispose();panelDock?.dispose();stackHover.dispose();definitionUI.dispose();navigation.dispose();detached.dispose();previewEpoch++;disassembler.stop();for(const p of classPreviews.values())p.model.dispose();overlayThemeObserver.disconnect();editorOverlays.remove();offsetWorker.dispose();for(const timer of offsetTimers.values())clearTimeout(timer);clearInterval(folderWatch);clearTimeout(analysisTimer);compiler.stop();runner?.stop();editor.dispose();for(const model of models.values())model.dispose();});
void installProject(project);
