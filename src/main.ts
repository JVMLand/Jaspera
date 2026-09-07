import type {AnalysisProgress} from './protocol';
import {memoryPolicy} from './memory-policy';
import {usageCompiler} from './usage-compilation';
import {installInstructionGraph} from './instruction-graph';
import type {GraphDocument} from './protocol';
import {planPathChange} from './project-paths';
import {tabLabels} from './file-labels';
import {examples,exampleSource,rememberExample,withoutExampleLayout} from './example-library';
import {inlayHintOptions} from './inlay-hint-style';
import {installConsoleContextMenu} from './console-panel';
import {installProblemsContextMenu} from './problems-panel';
import {editMenuItems} from './edit-menu';
import {fileKind,installFilePicker} from './file-opening';
import {helpMenuItems} from './help';
import * as monaco from './editor-platform';
import {WorkspaceStateStore} from './workspace-state';
import {CompilationService} from './compilation-service';
import {SourceAnalysis,showBytecodeOffsets} from './source-analysis';
import {EditorPane,paneTab,paneIdentity,beforePane,movePaneOrder} from './pane';
import {layoutSides,type WorkspaceLayout} from './workspace-layout';
import {renderProjectTree} from './project-tree';
import {paneDrop} from './tab-interactions';
import type {Side} from './panel-dock';
import {followInstructionClicks} from './instruction-click';
import {installPanelDock} from './panel-dock';
import {installInstructionsPanel} from './instructions-panel';
import {installStackHover} from './stack-hover';
import {currentInspections} from './inspection-actions';

import { registerLanguage } from './language';
import { Runtime } from './runtime';
import {createDetachedHost} from './detached-host';
import {createNavigation,installDefinitionUI} from './navigation';
import { defaultProject, validateProject, validatePath as relativePath, type Project } from './project';
import { openFolder, parseProperties, pickFolder, newBinding, saveFolder, projectArchive, type FolderBinding, type ClassFileEntry } from './folder-project';
import { installMenus } from './menus';
import type { Compilation } from './protocol';
import './style.css';
import './theme-layouts.css';
import { initializeThemes, openThemePicker, applyTheme, onThemeChange, selectedTheme } from './themes';

registerLanguage(()=>navigation.completionCatalog());
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header class="toolbar">
  <div class="brand"><img class="brand-logo" src="./favicon.svg" alt="Javasm ロゴ" width="40" height="40"><h1>JAL<span>Web</span></h1><span class="brand-caption">JVM ASSEMBLY LAB</span></div>
  <div class="toolbar-actions"><button id="run" class="run" title="実行（Ctrl+Enter / F5）"><span aria-hidden="true">▶</span> Run <kbd>Ctrl ↵</kbd></button></div>
</header>
<nav class="menubar" aria-label="メインメニュー"><div id="menus" role="menubar" aria-label="アプリケーションメニュー"></div><span id="project-name"></span></nav>

<dialog id="dialog"><form method="dialog"><h2 id="dialog-title"></h2><p id="dialog-message"></p><div id="dialog-input-row"><input id="dialog-input" aria-labelledby="dialog-title" autocomplete="off"><span id="dialog-suffix" hidden></span></div><div class="dialog-actions"><button type="button" id="dialog-cancel">キャンセル</button><button type="submit" value="ok" id="dialog-ok">OK</button></div></form></dialog>
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
    <div class="pane-header output-header"><div class="tabs" role="tablist" aria-label="実行パネル"><button role="tab" id="console-tab" aria-controls="console-panel" aria-selected="true">Console</button><button role="tab" id="problems-tab" aria-controls="problems-panel" aria-selected="false" tabindex="-1">Problems <span id="problem-count">0</span></button><button role="tab" id="instructions-tab" aria-controls="instructions-panel" aria-selected="false" tabindex="-1">Instructions</button><button role="tab" id="graph-tab" aria-controls="graph-panel" aria-selected="false" tabindex="-1">Graph</button></div><button id="clear" class="icon-button" title="コンソールを消去" aria-label="コンソールを消去">⌫</button></div>
    <div id="console-panel" role="tabpanel" aria-labelledby="console-tab"><div id="console-empty"><span class="terminal-symbol" aria-hidden="true">&gt;_</span><p>コードを書いて、実行しよう。</p><span>Run または Ctrl + Enter</span></div><pre id="output" aria-label="標準出力と標準エラー" tabindex="0"></pre></div>
    <div id="problems-panel" role="tabpanel" aria-labelledby="problems-tab" hidden><p class="empty-problems">文法とスタックを検査しています…</p><ul id="problems"></ul></div>
    <div id="instructions-panel" role="tabpanel" aria-labelledby="instructions-tab" hidden></div><div id="graph-panel" role="tabpanel" aria-labelledby="graph-tab" hidden></div>
    <div class="stdin-section"><label for="stdin">STANDARD INPUT <span>実行開始時に読み込み</span></label><textarea id="stdin" spellcheck="false" placeholder="標準入力（任意）" aria-label="標準入力"></textarea></div>
    <div class="runtime-card"><span class="runtime-dot"></span><div><strong>WebAssembly JVM</strong><span>OpenJDK 23 · ブラウザ内で実行</span></div><span class="runtime-label">LOCAL</span></div>
  </section>
</main>
<footer class="statusbar"><div><span id="state-dot" class="status-dot loading"></span><span id="state" role="status" aria-live="polite">JVM を読み込み中…</span></div><span id="instruction-hint">命令ホバーでスタックの変化を表示</span><span id="timing"></span></footer>`;
const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
let project=defaultProject();
const workspaceState=new WorkspaceStateStore();
const unsubscribeTheme=onThemeChange(theme=>workspaceState.update({theme}));
interface ClassPreview {example?:boolean;key:string;title:string;model:monaco.editor.ITextModel;folderPath?:string;mtime:number;size:number}
const classPreviews=new Map<string,ClassPreview>();let activePreview:string|undefined,previewEpoch=0,dropSequence=0;
let classQueue=Promise.resolve();
let folder:FolderBinding|undefined,storageBusy=false,changeVersion=0,watchBusy=false,applyingExternal=false;
let dirty=false, revision=0, checkedRevision=-1, running=false, runToken=0, disposed=false;
let models=new Map<string,monaco.editor.ITextModel>();
const closedSourceTabs=new Set<string>();
let tabOrder:string[]=[];let restoringLayout=false;
let results=new Map<string,Compilation>();
let problemTargets:{path:string;line:number;column:number}[]=[];
const sourceAnalysis=new SourceAnalysis(model=>{
 if([...models.values()].includes(model))showDiagnostics();
 for(const view of groupEditors.values())if(view.getModel()===model)refreshOffsets(view);
},model=>[...models.values()].includes(model)||model.uri.authority==='example');
const scheduleOffsets=(model:monaco.editor.ITextModel)=>sourceAnalysis.schedule(model);
let analysisPromise:Promise<void>|undefined;
let analysisTimer:ReturnType<typeof setTimeout>;
const memory=memoryPolicy((navigator as Navigator & {deviceMemory?:number}).deviceMemory);
const compiler=new Runtime(memory.analysisHeapMiB);
const compilationService=new CompilationService(compiler,memory.backgroundIdleMs);
const visibilityChanged=()=>compilationService.setBackground(document.visibilityState==='hidden');
document.addEventListener('visibilitychange',visibilityChanged);visibilityChanged();
const compileUsage=usageCompiler(compilationService,memory.usageCacheEntries);
const compileModel=(model:monaco.editor.ITextModel)=>compilationService.compile(model,model.getValue(),undefined,{stackFrames:true});
function graphFocus(model:monaco.editor.ITextModel,line=1,column=1){
 const previous=workspaceState.value.graphDocument,uri=model.uri.toString(),version=model.getVersionId();
 const same=previous?.uri===uri&&previous.version===version;if(same&&previous.line===line&&previous.column===column)return;
 workspaceState.update({graphDocument:{uri,version,line,column,source:same?previous.source:model.getValue()}});
}
function graphModel(doc:GraphDocument){const model=monaco.editor.getModel(monaco.Uri.parse(doc.uri));return model&&!model.isDisposed()&&model.getVersionId()===doc.version&&model.getValue()===doc.source?model:undefined;}
const graphCompilation=(doc:GraphDocument,onProgress?:(progress:AnalysisProgress)=>void)=>{const model=graphModel(doc);return model?compilationService.compile(model,model.getValue(),onProgress,{graphs:true}):Promise.reject(new Error('文書の版が変更されています。'));};
const graphNavigate=(doc:GraphDocument,line:number,column:number)=>{if(graphModel(doc))void openDefinition(doc.uri,{lineNumber:line,column});};
let runner:Runtime|undefined;
const editorOverlays=document.createElement('div');editorOverlays.id='editor-overlays';document.body.append(editorOverlays);
// Theme is global to Monaco; editor options must not override it when groups are created.
initializeThemes();
workspaceState.update({theme:selectedTheme()});
export let editor=monaco.editor.create(el('editor'),{inlayHints:inlayHintOptions,overflowWidgetsDomNode:editorOverlays,fixedOverflowWidgets:true,automaticLayout:true,fontSize:15,lineHeight:27,
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
const stackHover=installStackHover(editor,compileModel);
const detached=createDetachedHost(key=>{const owner=project;queueMicrotask(()=>{if(disposed||restoringLayout||project!==owner)return;for(const view of groupEditors.values()){const model=view.getModel(),doc=model?detachableDocument(model.uri.toString()):undefined;if(doc&&detached.has(doc.key))view.setModel(null);}
if(key.startsWith('panel:')){panelDock?.show(key.slice(6) as 'project'|'console'|'problems'|'instructions'|'graph');return;}const current=editor.getModel();if(current&&detached.has(!activePreview?'source:'+project.workspace.activeFile:'preview:'+activePreview)){captureView();activePreview=undefined;editor.setModel(null);}const tab=visibleTabs().find(t=>t.key===key);const next=tab??visibleTabs()[0];if(!editor.getModel()&&next)selectEditorTab(next);else{renderFiles();updateActions();}});},()=>void saveProject(),model=>void run(model),{
 graphFocus,graphCompilation,graphNavigate,projectAction,compileUsage,compile:compileModel,resolve:(model,offset,labelsOnly)=>navigation.resolve(model,offset,labelsOnly),completionCatalog:()=>navigation.completionCatalog(),document:detachableDocument,view:key=>{const doc=detachableDocument(key),view=[...groupEditors.values()].find(v=>v.getModel()===doc?.model),p=view?.getPosition();return p&&view?{line:p.lineNumber,column:p.column,scrollTop:Math.round(view.getScrollTop()),scrollLeft:Math.round(view.getScrollLeft())}:key.startsWith('source:')?project.workspace.views[key.slice(7)]:undefined;},
 openFiles, state:()=>workspaceState.value,subscribe:listener=>workspaceState.subscribe(listener),
 instruction:op=>{instructionPanel.showInstruction(op);detached.showInstruction(op);},
 panelOpened:name=>panelDock?.close(name),stdin:setStdin,clearOutput:()=>el('clear').click(),problem:(index,group)=>{const target=problemTargets[index],model=target?models.get(target.path):undefined;if(target&&model)void window.jalwebDetached?.openDefinition(group,model.uri.toString(),model.validatePosition({lineNumber:target.line,column:target.column}));},
 stop:()=>stopRun(),check:model=>void checkDocument(model),theme:id=>applyTheme(id),
 async classFile(model){if(model.uri.authority==='example'){const c=await compileExample(model);return c.bytecode?{name:c.className.split('/').pop()+'.class',bytecode:c.bytecode}:undefined;}await analyze();const path=[...models].find(([,m])=>m===model)?.[0],c=path?results.get(path):undefined;if(checkedRevision===revision&&c?.bytecode)return {name:c.className.split('/').pop()+'.class',bytecode:c.bytecode};}
});

const navigation=createNavigation({
 models:()=>[...models.values(),...[...classPreviews.values()].map(p=>p.model)],
 async classBytes(owner){
  const matches=(folder?.classFiles??[]).filter(f=>f.path===owner+'.class'||f.path.endsWith('/'+owner+'.class'));
  if(matches.length!==1)return;const file=await matches[0].handle.getFile();if(file.size>1024*1024)return;return new Uint8Array(await file.arrayBuffer());
 },
 async disassemble(bytes){
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const work=classQueue.then(()=>compilationService.disassemble(btoa(binary)));classQueue=work.then(()=>{},()=>{});return work;
 }
});
const definitionUI=installDefinitionUI((model,offset,labelsOnly)=>navigation.resolve(model,offset,labelsOnly),openDefinition);
function previewTitle(p:ClassPreview){return p.example?p.title:p.title+' (JAL)';}
function ensureExample(path:string){
 const key='example:'+path;if(classPreviews.has(key))return classPreviews.get(key);
 const source=exampleSource(path);if(source===undefined)return;
 const model=monaco.editor.createModel(source,'jal',monaco.Uri.from({scheme:'inmemory',authority:'example',path:'/'+path}));
 const preview:ClassPreview={key,title:path,model,example:true,mtime:0,size:0};classPreviews.set(key,preview);
 model.onDidChangeContent(()=>{rememberExample(path,model.getValue());scheduleOffsets(model);monaco.editor.setModelMarkers(model,'jal',[]);});scheduleOffsets(model);return preview;
}
async function checkDocument(model:monaco.editor.ITextModel|null=editor.getModel()){
 if(model?.uri.authority!=='example'){clearTimeout(analysisTimer);await analyze();return;}
 try{const result=await compileExample(model);status(result.diagnostics.some(d=>d.severity==='error')?'コンパイルエラー':'実行できます',result.diagnostics.some(d=>d.severity==='error')?'error':'ready');}catch(error){status(String(error),'error');}
}
async function compileExample(model:monaco.editor.ITextModel){
 const version=model.getVersionId(),result=await compilationService.compile(model,model.getValue(),undefined,{});
 if(!model.isDisposed()&&model.getVersionId()===version)monaco.editor.setModelMarkers(model,'jal',result.diagnostics.map(d=>{
  const p=model.validatePosition({lineNumber:d.line,column:d.column});return {severity:d.severity==='error'?monaco.MarkerSeverity.Error:monaco.MarkerSeverity.Warning,message:d.message,startLineNumber:p.lineNumber,startColumn:p.column,endLineNumber:p.lineNumber,endColumn:Math.min(model.getLineMaxColumn(p.lineNumber),p.column+Math.max(1,d.length)),source:'JAL'};
 }));return result;
}
function detachableDocument(keyOrUri:string){
 if(keyOrUri.startsWith('preview:example:'))ensureExample(keyOrUri.slice('preview:example:'.length));
 const source=[...models].find(([path,m])=>'source:'+path===keyOrUri||m.uri.toString()===keyOrUri);
 if(source)return {key:'source:'+source[0],title:source[0],model:source[1],readOnly:false};
 let preview=[...classPreviews.values()].find(p=>'preview:'+p.key===keyOrUri||p.model.uri.toString()===keyOrUri);
 if(!preview){const model=monaco.editor.getModels().find(m=>m.uri.toString()===keyOrUri&&m.uri.authority==='definition');if(!model||model.isDisposed())return;const name=model.uri.path.slice(1).replace(/\.jal$/,'.class');preview={key:'definition:'+name,title:name,model,mtime:0,size:0};classPreviews.set(preview.key,preview);scheduleOffsets(model);}
 return {key:'preview:'+preview.key,title:previewTitle(preview),model:preview.model,readOnly:!preview.example};
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
const filePicker=installFilePicker(files=>void openFiles(files));
const menus=installMenus(el('menus'),[
  {label:'File',items:[
    {id:'new-file',label:'新規ファイル…',action:()=>void addFile()},
    {id:'new-project',label:'新規プロジェクト',action:()=>void newProject()},
    null,
    {id:'open-files',label:'開く…',shortcut:'Ctrl+O',action:filePicker.open},
    {id:'open-project',label:'フォルダーを開く…',action:()=>void openProjectFolder()},
    null,
    {id:'save-project',label:'保存',shortcut:'Ctrl+S',action:()=>void saveProject()},
    {id:'save-project-as',label:'別の場所に保存…',action:()=>void saveProject(true)},
    {id:'export-project',label:'ZIP に書き出す…',action:()=>void exportProject()},
    {id:'save-class-source',label:'JAL に書き出す…',action:()=>{const p=activePreview?classPreviews.get(activePreview):undefined;if(p)download(new Blob([p.model.getValue()],{type:'text/plain;charset=utf-8'}),p.title.replace(/\.class$/i,'.jal').split('/').pop()!);}},
    null,
    {id:'close-tab',label:'ファイルを閉じる',action:()=>{const tab=visibleTabs().find(t=>t.active);if(tab)closeEditorTabs(tab.key);}},
    {id:'rename-file',label:'名前を変更…',action:()=>void renameFile()},
    {id:'remove-file',label:'削除…',action:()=>void removeFile()},
    null,
    {id:'project-properties-menu',label:'プロジェクトのプロパティ…',action:openProperties}
  ]},
  {label:'Edit',items:editMenuItems(editAction)},
  {label:'View',items:[{id:'wrap',label:'折り返し',action:()=>{project.workspace.wordWrap=!project.workspace.wordWrap;editor.updateOptions({wordWrap:project.workspace.wordWrap?'on':'off'});setDirty();}},{id:'theme-settings',label:'テーマ…',action:openThemePicker},null,...(['project','console','problems','instructions','graph'] as const).map(name=>({id:'show-'+name,label:name[0].toUpperCase()+name.slice(1),action:()=>selectTab(name)})),{id:'swap-panes',label:'左右のペインを入れ替える',action:()=>panelDock?.swap()}]},
  {label:'Build',items:[
    {id:'check-project',label:'検査',action:()=>void checkDocument()},
    {id:'menu-run',label:'実行',shortcut:'Ctrl+Enter',action:()=>void run()},
    {id:'download',label:'class に書き出す…',action:downloadClass}
  ]},
  {label:'Help',items:helpMenuItems()}
]);
function status(text:string,kind:'ready'|'loading'|'error'='ready') {workspaceState.update({status:text});el('state').textContent=text;el('state-dot').className=`status-dot ${kind}`;}
function setDirty(value=true) {if(value)changeVersion++;dirty=value;el('project-name').textContent=project.name+(dirty?' •':'');document.title=`${dirty?'• ':''}${project.name} — JALWeb`;el('summary-project-name').textContent=project.name;}
function validatePath(path:string){relativePath(path);if(folder?.properties!==false&&!path.startsWith('src/'))throw new Error('ソースは src/ 以下に置いてください。');}
function refreshOffsets(view=editor){showBytecodeOffsets(view,sourceAnalysis.offsets(view.getModel()));}
function publishWorkspaceAvailability(){workspaceState.update({canSave:!!folder&&!storageBusy,running});}
function updateActions() {
  publishWorkspaceAvailability();
  refreshOffsets();
  const model=editor.getModel(),readOnly=editor.getRawOptions().readOnly;
  for(const id of ['undo','redo','replace','format','comment','quick-fix'])menus.disabled(id,!model||!!readOnly);
  menus.disabled('find',!model);
  menus.disabled('rename-file',!!activePreview||!editor.getModel()||!project.files.length);menus.disabled('close-tab',!editor.getModel());menus.hidden('save-class-source',!activePreview);
  menus.disabled('project-properties-menu',folder?.properties===false);el<HTMLButtonElement>('summary-properties').disabled=folder?.properties===false;
  const runButton=el<HTMLButtonElement>('run');
  runButton.innerHTML=running?'<span aria-hidden="true">■</span> Stop <kbd>Ctrl ↵</kbd>':'<span aria-hidden="true">▶</span> Run <kbd>Ctrl ↵</kbd>';
  runButton.title=(running?'停止':'実行')+'（Ctrl+Enter / F5）';
  runButton.setAttribute('aria-label',running?'停止':'実行');
  menus.label('menu-run',running?'停止':'実行');
  menus.disabled('download',editor.getModel()?.uri.authority!=='example'&&(!!activePreview||!editor.getModel()||checkedRevision!==revision || !results.get(project.workspace.activeFile)?.bytecode));
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
  workspaceState.update({files:[...project.files.map(f=>({key:'source:'+f.path,title:f.path})),...examples.map(f=>({key:'preview:example:'+f.path,title:f.path})),...[...classPreviews.values()].filter(p=>!p.example).map(p=>({key:'preview:'+p.key,title:previewTitle(p)}))]});
  const list=el('file-list');list.replaceChildren();document.querySelectorAll('.workspace .editor-tab').forEach(n=>n.remove());
  renderProjectTree(list,[...examples.map(f=>({path:f.path,key:'preview:example:'+f.path,active:activePreview==='example:'+f.path,open:()=>{ensureExample(f.path);selectClassPreview('example:'+f.path);}})),...project.files.map(f=>({path:f.path,key:'source:'+f.path,active:!!editor.getModel()&&!activePreview&&f.path===project.workspace.activeFile,open:()=>switchFile(f.path)})),...(folder?.classFiles??[]).map(f=>({path:f.path,key:'',active:activePreview==='folder:'+f.path,open:()=>queueClass(()=>f.handle.getFile(),'folder:'+f.path,f.path,true,f.path)}))],window.jalwebDetached!.workspaceId,collapsedFolders,{create:directory=>void addFile(directory),rename:(path,folder)=>void changePath(path,folder,false),move:(path,folder)=>void changePath(path,folder,true)});
  const tabs=visibleTabs(),labels=tabLabels(tabs.map(tab=>({key:tab.key,path:tab.label})));
  for(const tab of tabs)renderEditorTab(tab,labels.get(tab.key)!);
  panelDock?.refresh();
}
function attachModel(path:string,source:string) {
  const model=monaco.editor.createModel(source,'jal',monaco.Uri.from({scheme:'inmemory',authority:'jal',path:'/'+path}));
  model.onDidChangeContent(()=>{scheduleOffsets(model);if(!applyingExternal){invalidate();setDirty();}});models.set(path,model);scheduleOffsets(model);return model;
}
function invalidate() {revision++;checkedRevision=-1;updateActions();clearTimeout(analysisTimer);analysisTimer=setTimeout(()=>void analyze(),500);}
async function installProject(next:Project,binding?:FolderBinding) {
 restoringLayout=true;detached.closeAll();panelDock?.restore();navigation.reset();tabOrder=[];collapsedFolders.clear();sourceGroups.clear();for(const view of groupEditors.values())view.setModel(null);activeSide='source';editor=groupEditors.get('source')!;

  previewEpoch++;for(const p of classPreviews.values())p.model.dispose();classPreviews.clear();activePreview=undefined;
  folder=binding;
  stopRun(false);clearTimeout(analysisTimer);revision++;checkedRevision=-1;
  editor.setModel(null);for(const model of models.values())model.dispose();models=new Map();
  project=next;closedSourceTabs.clear();results.clear();
  for(const f of project.files)attachModel(f.path,f.source);
  editor.updateOptions({wordWrap:project.workspace.wordWrap?'on':'off'});
  if(project.workspace.layout)await restorePreviewTabs(project.workspace.layout);if(project!==next)return;
  switchFile(project.workspace.activeFile,false);setStdin(project.workspace.stdin,false);
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
  const layout=withoutExampleLayout(captureWorkspace());return {...project,files:project.files.map(f=>({path:f.path,source:models.get(f.path)!.getValue()})),workspace:{...project.workspace,layout}};
}
function download(blob:Blob,name:string) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function storageState(busy:boolean){storageBusy=busy;publishWorkspaceAvailability();if(busy)status('ファイルを処理中…','loading');for(const id of ['new-project','open-project','open-files','save-project','save-project-as','export-project'])menus.disabled(id,busy);}
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
     results.delete(path);delete project.workspace.views[path];
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

 captureView();activeSide=sourceGroups.get('preview:'+key)??'source';editor=groupEditors.get(activeSide)!;panelDock?.showSource(activeSide);const preview=classPreviews.get(key);if(!preview)return;activePreview=key;editor.setModel(preview.model);editor.updateOptions({readOnly:!preview.example});renderFiles();updateActions();
}
interface EditorTab {key:string;label:string;active:boolean;sourcePath?:string;previewKey?:string}
function visibleTabs():EditorTab[]{
 const tabs:EditorTab[]=[
  ...project.files.filter(f=>!closedSourceTabs.has(f.path)).map(f=>({key:'source:'+f.path,label:f.path,sourcePath:f.path,active:!activePreview&&editor.getModel()===models.get(f.path)})),
  ...[...classPreviews.values()].map(p=>({key:'preview:'+p.key,label:previewTitle(p),previewKey:p.key,active:activePreview===p.key}))
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
function renderEditorTab(item:EditorTab,label:string){
 const side=sourceGroups.get(item.key)??'source';const view=groupEditors.get(side)!;item.active=view.getModel()===(item.sourcePath!==undefined?models.get(item.sourcePath):classPreviews.get(item.previewKey!)?.model);
 const pane=new EditorPane(item.key,item.label,{select:()=>selectEditorTab(item),close:others=>{if(others)panelDock?.closeTools(side);closeEditorTabs(item.key,others);}});
 const {wrapper}=paneTab(pane,window.jalwebDetached!.workspaceId,item.active,undefined,label);(panelDock?.strips[side]??el('file-tabs')).append(wrapper);
}
function detachEditorTab(item:EditorTab){
 const model=item.sourcePath!==undefined?models.get(item.sourcePath):classPreviews.get(item.previewKey!)?.model;
 if(!model||model.isDisposed())return;
 if(!detached.open(item.key,item.label,model,item.previewKey!==undefined&&!classPreviews.get(item.previewKey)?.example)){
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
 const follow=()=>{const model=view.getModel(),p=view.getPosition();if(model)graphFocus(model,p?.lineNumber,p?.column);};
 groupResources.push(view.onDidChangeModel(follow),view.onDidFocusEditorText(follow),view.onDidChangeCursorPosition(follow),view.onDidChangeModelContent(follow));

 view.onDidFocusEditorText(()=>{if(editor===view)return;captureView();editor=view;activeSide=side;const model=view.getModel(),path=[...models].find(([,m])=>m===model)?.[0];if(path){project.workspace.activeFile=path;activePreview=undefined;}else activePreview=[...classPreviews.values()].find(p=>p.model===model)?.key;renderFiles();updateActions();});
 view.onDidChangeModel(()=>refreshOffsets(view));
 if(side==='source')return;
 groupResources.push(installStackHover(view,compileModel),followInstructionClicks(view,op=>{instructionPanel.showInstruction(op);detached.showInstruction(op);}));
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
   if(!silent)status(title+' を逆アセンブル中…','loading');const result=await compilationService.disassemble(btoa(binary));
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
async function openFiles(files:File[]):Promise<string[]>{
 if(storageBusy)return [];
 if(files.length>64){await dialog('ファイルを開けませんでした','一度に開けるファイルは64個までです。');return [];}
 if(files.some(file=>fileKind(file.name)==='project')){
  if(files.length!==1){await dialog('プロジェクトを開く','プロジェクトは1つずつ開いてください。');return [];}
  const file=files[0];
  try{
   if(file.size>65536)throw new Error('プロジェクト設定は64 KiB以下にしてください。');
   const text=await file.text();parseProperties(text);
   if(await dialog('プロジェクトを開く','ソースも読み込むため、'+file.name+' があるフォルダーを選んでください。',undefined,true,'フォルダーを選ぶ')===null)return [];
   storageState(true);
   const root=await pickFolder(),loaded=await openFolder(root,true);
   if(loaded.binding.configName!==file.name||loaded.binding.baseline.get(file.name)!==text)throw new Error('選んだプロジェクトのフォルダーではありません。');
   if(await allowReplace())await installProject(loaded.project,loaded.binding);
  }catch(e){storageError(e,'プロジェクトを開けませんでした');}finally{storageState(false);}
  return [];
 }
 const owner=project,opened:string[]=[];
 for(const file of files){
  if(project!==owner)break;
  try{
   const kind=fileKind(file.name);
   if(kind==='class'){
    const key='drop:'+(++dropSequence);await queueClass(async()=>file,key,file.name);
    if(project===owner&&classPreviews.has(key))opened.push('preview:'+key);
   }else if(kind==='source'){
    if(file.size>1024*1024)throw new Error('ソースは1 MiB以下にしてください。');
    const source=await file.text();if(project!==owner)break;
    let path='src/'+file.name.replace(/\.jal$/i,'.jal');
    if(project.files.some(f=>f.path.toLowerCase()===path.toLowerCase())){
     const selected=await dialog('同じ名前のファイルがあります','読み込むファイルに別の名前を付けてください。',path.replace(/\.jal$/,'_2.jal'));
     if(selected===null)continue;path=selected;
    }
    if(project!==owner)break;
    validatePath(path);
    if(project.files.some(f=>f.path.toLowerCase()===path.toLowerCase()))throw new Error('同じ名前のファイルがあります。');
    const copy=snapshot();copy.files.push({path,source});if(copy.files.length===1)copy.workspace={...copy.workspace,activeFile:path,entryFile:path};validateProject(copy);
    project.files.push({path,source});if(project.files.length===1)project.workspace.entryFile=path;
    attachModel(path,source);switchFile(path);invalidate();setDirty();opened.push('source:'+path);
   }else throw new Error('開けるファイルは .jal、.class、.jalprj です。');
  }catch(e){await dialog(file.name+' を開けませんでした',e instanceof Error?e.message:String(e));}
 }
 return opened;
}
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
window.addEventListener('drop',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();void openFiles([...e.dataTransfer.files]);}});

async function downloadClass() {
  const model=editor.getModel(),example=model?.uri.authority==='example';
  const c=example?await compileExample(model!):results.get(project.workspace.activeFile);if((!example&&checkedRevision!==revision) || !c?.bytecode)return;
  download(new Blob([Uint8Array.from(atob(c.bytecode),x=>x.charCodeAt(0))],{type:'application/java-vm'}),c.className.split('/').pop()+'.class');
}
function dialog(title:string,message:string,input?:string,confirm=false,confirmLabel='変更を破棄して続ける',suffix=''):Promise<string|null> {
  const d=el<HTMLDialogElement>('dialog');if(d.open)return Promise.resolve(null);
  el('dialog-title').textContent=title;el('dialog-message').textContent=message;
  const field=el<HTMLInputElement>('dialog-input');field.hidden=input===undefined;field.value=input??'';
  el('dialog-input-row').hidden=input===undefined;el('dialog-suffix').hidden=!suffix;el('dialog-suffix').textContent=suffix;
  if(suffix)field.setAttribute('aria-describedby','dialog-suffix');else field.removeAttribute('aria-describedby');
  el('dialog-cancel').hidden=input===undefined&&!confirm;el('dialog-cancel').onclick=()=>d.close('cancel');
  el('dialog-ok').textContent=confirm?confirmLabel:'OK';d.returnValue='';d.showModal();
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
async function addFile(directory='src') {
  const owner=project;
  const name=await dialog('JAL ファイルを追加','ファイル名を入力してください（例: src/com.example.Helper）。',(directory?directory+'/':'')+'Helper',false,'','.jal');if(name===null||project!==owner)return;
  const path=name.trim().replace(/\.jal$/i,'').replaceAll('.','/')+'.jal';
  try {if(path==='.jal')throw new Error('ファイル名を入力してください。');validatePath(path);if(project.files.length>=64)throw new Error('ファイルは 64 個までです。');if(project.files.some(f=>f.path.toLowerCase()===path.toLowerCase()))throw new Error('同じファイル名が存在します。');}
  catch(e){await dialog('追加できませんでした',String(e instanceof Error?e.message:e));return;}
  const className=path.replace(/^src\//,'').slice(0,-4).replace(/[^a-zA-Z0-9_$/]/g,'_').replace(/(^|\/)(?=\d)/g,'$1_');
  if(!project.files.length)project.workspace.entryFile=path;
  project.files.push({path,source:`public class ${className} {\n}\n`});attachModel(path,project.files.at(-1)!.source);switchFile(path);invalidate();setDirty();editor.focus();
}
async function renameFile(){if(!activePreview&&project.workspace.activeFile)await changePath(project.workspace.activeFile,false,false);}
function projectAction(action:'create'|'rename'|'move',path:string,isFolder:boolean){window.focus();if(action==='create')void addFile(path);else void changePath(path,isFolder,action==='move');}
async function changePath(old:string,isFolder:boolean,move:boolean){
 const owner=project,parent=old.split('/').slice(0,-1).join('/'),base=old.split('/').pop()!;
 const input=await dialog(move?'移動先フォルダー':isFolder?'フォルダー名を変更':'ファイル名を変更',move?'移動先のフォルダーパスを入力してください。空欄ならルートに移動します。':'クラス名・参照はソース内で変更してください。',move?parent:isFolder?base:base.replace(/\.jal$/i,''),false,'',!move&&!isFolder?'.jal':'');
 if(input===null||project!==owner)return;
 const name=input.trim().replaceAll('\\','/');
 const destination=move?(name?name.replace(/\/$/,'')+'/':'')+base:(parent?parent+'/':'')+(isFolder?name:name.replace(/\.jal$/i,'').replaceAll('.','/')+'.jal');
 if(destination===old)return;
 try{
  if(!move&&!name)throw new Error('名前を入力してください。');
  const paths=project.files.map(f=>f.path),changes=planPathChange(paths,old,destination,isFolder);
  if(folder?.classFiles?.some(f=>[...changes.values()].some(path=>path.toLowerCase()===f.path.toLowerCase()||path.toLowerCase().startsWith(f.path.toLowerCase()+'/'))))throw new Error('移動先に同じ名前のファイルが存在します。');
  captureView();
  for(const [from,to] of changes){
   const model=models.get(from)!,source=model.getValue(),key='source:'+from,newKey='source:'+to;
   const views=[...groupEditors.values()].filter(view=>view.getModel()===model).map(view=>({view,state:view.saveViewState()}));
   attachModel(to,source);const next=models.get(to)!;
   const file=project.files.find(f=>f.path===from)!;file.path=to;file.source=source;
   if(project.workspace.entryFile===from)project.workspace.entryFile=to;
   if(project.workspace.activeFile===from)project.workspace.activeFile=to;
   if(project.workspace.views[from])project.workspace.views[to]=project.workspace.views[from];delete project.workspace.views[from];
   if(closedSourceTabs.delete(from))closedSourceTabs.add(to);
   const side=sourceGroups.get(key);sourceGroups.delete(key);if(side)sourceGroups.set(newKey,side);
   tabOrder=tabOrder.map(value=>value===key?newKey:value);
   detached.replaceDocument(key,{key:newKey,title:to,model:next,readOnly:false});
   for(const {view,state} of views){view.setModel(next);if(state)view.restoreViewState(state);}
   models.delete(from);model.dispose();results.delete(from);
  }
  if(isFolder){for(const path of [...collapsedFolders])if(path===old||path.startsWith(old+'/')){collapsedFolders.delete(path);collapsedFolders.add(destination+path.slice(old.length));}}
  renderFiles();invalidate();setDirty();updateActions();
 }catch(error){await dialog('変更できませんでした',error instanceof Error?error.message:String(error));}
}
async function removeFile() {
  if(activePreview)return;
  if(project.files.length<=1)return;const path=project.workspace.activeFile;
  if(await dialog('ファイルを削除',`${path} をプロジェクトから削除します。`,undefined,true)===null)return;
  project.files=project.files.filter(f=>f.path!==path);
  if(project.workspace.entryFile===path)project.workspace.entryFile=project.files[0].path;
  switchFile(project.files[0].path);models.get(path)!.dispose();models.delete(path);results.delete(path);delete project.workspace.views[path];invalidate();setDirty();
}
el('add-file').onclick=()=>void addFile();
function setStdin(text:string,edited=true){
 project.workspace.stdin=text;
 workspaceState.updateTools({stdin:text});
 el<HTMLTextAreaElement>('stdin').value=text;
 if(edited)setDirty();
}
el<HTMLTextAreaElement>('stdin').oninput=()=>setStdin(el<HTMLTextAreaElement>('stdin').value);
function output(text:string,stream='stdout') {workspaceState.updateTools({output:[...workspaceState.value.tools.output,{text,stream}]});el('console-empty').hidden=true;const span=document.createElement('span');span.className=stream;span.textContent=text;el('output').append(span);const scroller=document.querySelector<HTMLElement>('.dock-console-body')??el('console-panel');scroller.scrollTop=scroller.scrollHeight;}
const instructionPanel=installInstructionsPanel(el('instructions-panel'),compileUsage);
const graphPanel=installInstructionGraph(el('graph-panel'),graphCompilation,graphNavigate);
const unsubscribeGraph=workspaceState.subscribe(()=>graphPanel.update(workspaceState.value.graphDocument));
if(editor.getModel())graphFocus(editor.getModel()!,editor.getPosition()?.lineNumber,editor.getPosition()?.column);
const instructionClicks=followInstructionClicks(editor,op=>{instructionPanel.showInstruction(op);detached.showInstruction(op);});
panelDock=installPanelDock(name=>{project.workspace.panel=name;},()=>{for(const view of groupEditors.values())view.layout();},side=>{for(const tab of visibleTabs().filter(t=>(sourceGroups.get(t.key)??'source')===side))closeEditorTabs(tab.key);},name=>{if(!detached.openPanel(name))status('小窓がブロックされました。右クリックの「小窓で開く」から再度開いてください。','error');},window.jalwebDetached!.workspaceId,()=>tabOrder,name=>name==='project'?[{label:'新規 JAL ファイル…',action:()=>void addFile()},null]:[]);
for(const side of ['project','output'] as const){const container=document.createElement('div');container.className='group-editor';container.hidden=true;panelDock.panes[side].append(container);const view=monaco.editor.create(container,{...editor.getRawOptions(),model:null,automaticLayout:true,ariaLabel:side+' グループの JAL ソースコード'});groupEditors.set(side,view);bindGroupEditor(view,side);}
bindGroupEditor(groupEditors.get('source')!,'source');
for(const side of ['project','source','output'] as const)groupResources.push(paneDrop(panelDock.panes[side],window.jalwebDetached!.workspaceId,(key,event)=>movePane(key,side,event)));
groupResources.push(paneDrop(document.body,window.jalwebDetached!.workspaceId,key=>{const pane=paneIdentity(key);if(pane?.kind==='tool'){if(!detached.hasPanel(pane.name))detached.openPanel(pane.name);}else if(pane?.kind==='editor'){const tab=visibleTabs().find(t=>t.key===key);if(tab)detachEditorTab(tab);}}));
function selectTab(tab:'project'|'console'|'problems'|'instructions'|'graph'){if(detached.hasPanel(tab))detached.focusPanel(tab);else panelDock?.show(tab);}
groupResources.push(installConsoleContextMenu(el('console-panel'),el('output'),()=>el('clear').click()),installProblemsContextMenu(el('problems-panel')));
el('clear').onclick=()=>{workspaceState.updateTools({output:[]});el('output').textContent='';el('console-empty').hidden=false;};
function showDiagnostics() {
  const problems:{label:string;severity:string}[]=[];
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
      const label=`${path}:${d.line}:${d.column}  ${d.message}`;
      problems.push({label,severity:d.severity});
      const li=document.createElement('li'),b=document.createElement('button');b.className=d.severity;b.textContent=label;
      b.onclick=()=>{if(detached.has('source:'+path)){detached.focus('source:'+path);return;}switchFile(path);editor.setPosition(model.validatePosition({lineNumber:d.line,column:d.column}));editor.revealLineInCenter(d.line);editor.focus();};li.append(b);el('problems').append(li);
    }
  }
  workspaceState.updateTools({problems});
  el('problem-count').textContent=String(count);const empty=document.querySelector<HTMLElement>('.empty-problems')!;empty.hidden=count>0;empty.textContent='問題は見つかりませんでした。';
}
function hasErrors() {return [...results.values()].some(c=>c.diagnostics.some(d=>d.severity==='error'));}
compiler.onProgress=loaded=>{if(!running)status(`JVM を読み込み中… ${(loaded/1024/1024).toFixed(1)} MB`,'loading');};
async function analyze():Promise<void> {
  if(disposed)return;if(analysisPromise)return analysisPromise;
  analysisPromise=(async()=>{
    let checked=-1;
    while(checked!==revision&&!disposed) {
      checked=revision;const sources=[...models].map(([path,m])=>({path,model:m,source:m.getValue()}));
      if(!running)status('文法とスタックを検査中…','loading');
      try {
        const next=new Map<string,Compilation>();
        for(const f of sources) {
          const c=await compilationService.compile(f.model,f.source,undefined,{});
          if(checked!==revision)break;
          next.set(f.path,{...c,diagnostics:[...c.diagnostics]});
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
async function run(requestedModel?:monaco.editor.ITextModel) {
  const model=requestedModel??editor.getModel(),example=model?.uri.authority==='example';
  if(running){stopRun();return;}running=true;const token=++runToken;updateActions();let owned:Runtime|undefined;const started=performance.now();
  el('clear').click();el('console-empty').hidden=true;selectTab('console');status('コンパイル中…','loading');
  try {
    let entry:Compilation|undefined,classes:Compilation[];
    if(example){entry=await compileExample(model!);classes=entry.bytecode?[entry]:[];}
    else{clearTimeout(analysisTimer);await analyze();if(token!==runToken)return;
      if(checkedRevision!==revision)throw new Error('コンパイルを完了できませんでした。再度 Run を押してください。');
      if(hasErrors()){selectTab('problems');status('コンパイルエラー','error');return;}
      entry=results.get(project.workspace.entryFile);classes=[...results.values()];
    }
    if(token!==runToken)return;
    if(!entry?.bytecode)throw new Error(entry?.diagnostics.map(d=>d.message).join('\n')||'実行対象をコンパイルできませんでした。');
    owned=new Runtime(memory.executionHeapMiB);runner=owned;owned.onOutput=(stream,text)=>{if(token===runToken)output(text,stream);};owned.onProgress=loaded=>{if(token===runToken)status(`実行用 JVM を準備中… ${(loaded/1024/1024).toFixed(1)} MB`,'loading');};
    await owned.run({...entry,classes:classes.map(c=>({className:c.className,bytecode:c.bytecode}))},project.workspace.stdin);
    if(token===runToken){status('実行が完了しました');el('timing').textContent=`${((performance.now()-started)/1000).toFixed(2)} s`;}
  }catch(e){if(token===runToken){output(`${e instanceof Error?e.message:String(e)}\n`,'stderr');status('実行に失敗しました','error');}}
  finally {owned?.stop();if(token===runToken){runner=undefined;running=false;updateActions();}}
}
el('run').onclick=()=>void run();
editor.addAction({id:'jal.run',label:'JAL: Run',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.Enter,monaco.KeyCode.F5],run:()=>run()});
window.addEventListener('keydown',e=>{if(el<HTMLDialogElement>('theme-dialog').open||el<HTMLDialogElement>('dialog').open||el<HTMLDialogElement>('project-properties').open)return;if((e.ctrlKey||e.metaKey)&&!e.altKey){if(e.key.toLowerCase()==='s'){e.preventDefault();void saveProject();}else if(e.key.toLowerCase()==='o'){e.preventDefault();filePicker.open();}}});
window.addEventListener('beforeunload',e=>{if(dirty||storageBusy){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{disposed=true;document.removeEventListener('visibilitychange',visibilityChanged);filePicker.dispose();unsubscribeTheme();unsubscribeGraph();graphPanel.dispose();for(const resource of groupResources)resource.dispose();for(const view of groupEditors.values())if(view!==editor)view.dispose();instructionClicks.dispose();instructionPanel.dispose();panelDock?.dispose();stackHover.dispose();definitionUI.dispose();navigation.dispose();detached.dispose();previewEpoch++;for(const p of classPreviews.values())p.model.dispose();overlayThemeObserver.disconnect();editorOverlays.remove();sourceAnalysis.dispose();clearInterval(folderWatch);clearTimeout(analysisTimer);compilationService.dispose();runner?.stop();editor.dispose();for(const model of models.values())model.dispose();});
void installProject(project);
