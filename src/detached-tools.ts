import {installConsoleContextMenu} from './console-panel';
import {installProblemsContextMenu} from './problems-panel';
import {ToolPane,paneTab} from './pane';
import {renderProjectTree} from './project-tree';
import {installInstructionsPanel} from './instructions-panel';
import type {PanelName} from './panel-dock';
import type {DetachedBridge,ToolState,DetachedState} from './detached-host';
import './detached-tools.css';
export function installDetachedTools(bridge:DetachedBridge|undefined,group:string,onChange:()=>void){
 const names=new Set<PanelName>();let active:PanelName|undefined,last='';
 const container=document.createElement('section');container.className='detached-tools';container.hidden=true;
 container.innerHTML='<section id="popup-project"><div id="file-list"></div></section><section id="popup-console"><pre id="popup-output"></pre><label>標準入力<textarea id="popup-stdin"></textarea></label><button id="popup-clear">Console を消去</button></section><section id="popup-problems"><p class="empty-problems">問題は見つかりませんでした。</p><ul id="problems"></ul></section><section id="instructions-panel"></section>';
 document.body.append(container);const get=(id:string)=>container.querySelector<HTMLElement>('#'+id)!;
 const collapsed=new Set<string>();let lastFiles='';
 const panels={project:get('popup-project'),console:get('popup-console'),problems:get('popup-problems'),instructions:get('instructions-panel')};
 const instructions=installInstructionsPanel(panels.instructions,source=>bridge?bridge.compileUsage(source):Promise.reject(new Error('元のワークスペースに接続できません。')));
 const contexts=[installConsoleContextMenu(panels.console,get('popup-output'),()=>bridge?.clearOutput()),installProblemsContextMenu(panels.problems)];
 const input=get('popup-stdin') as HTMLTextAreaElement;input.oninput=()=>bridge?.stdin(input.value);get('popup-clear').onclick=()=>bridge?.clearOutput();
 function refresh(){container.hidden=!active;document.getElementById('editor')!.hidden=!!active;for(const name of ['project','console','problems','instructions'] as const)panels[name].hidden=name!==active;onChange();}
 const api={
  get active(){return active;},
  showInstruction(op:string){instructions.showInstruction(op);},
  show(name:PanelName){names.add(name);active=name;refresh();},
  remove(name:PanelName){names.delete(name);if(active===name)active=[...names][0];refresh();},
  showSource(){active=undefined;refresh();},
  closeOthers(name?:PanelName){for(const other of [...names])if(other!==name)bridge?.closePanel(group,other);},
  renderTabs(strip:HTMLElement,closeEditors:()=>void){for(const name of names){const pane=new ToolPane(name,name[0].toUpperCase()+name.slice(1),{select:()=>api.show(name),close:others=>{if(others){api.closeOthers(name);closeEditors();api.show(name);}else bridge?.closePanel(group,name);}});strip.append(paneTab(pane,bridge?.workspaceId??'',active===name).wrapper);}},
  update(state?:ToolState,files:DetachedState['files']=[]){const fileKey=JSON.stringify(files);if(fileKey!==lastFiles){lastFiles=fileKey;renderProjectTree(get('file-list'),files.map(file=>({path:file.title,key:file.key,open:()=>{const state=bridge?.openTab(group,file.key);if(state)bridge?.openDefinition(group,state.uri,{lineNumber:1,column:1});}})),bridge?.workspaceId??'',collapsed);}if(!state)return;const serialized=JSON.stringify(state);if(serialized===last)return;last=serialized;
   const output=get('popup-output');output.replaceChildren(...state.output.map(part=>{const span=document.createElement('span');span.className=part.stream;span.textContent=part.text;return span;}));output.scrollTop=output.scrollHeight;
   if(document.activeElement!==input)input.value=state.stdin;
   const problems=get('problems');problems.replaceChildren(...state.problems.map((item,index)=>{const li=document.createElement('li'),b=document.createElement('button');b.textContent=item.label;b.className=item.severity;b.onclick=()=>bridge?.problem(index,group);li.append(b);return li;}));panels.problems.querySelector<HTMLElement>('.empty-problems')!.hidden=state.problems.length>0;
  },
  dispose(){for(const context of contexts)context.dispose();instructions.dispose();container.remove();}
 };return api;
}
