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
 const instructions=installInstructionsPanel(panels.instructions);
 const input=get('popup-stdin') as HTMLTextAreaElement;input.oninput=()=>bridge?.stdin(input.value);get('popup-clear').onclick=()=>bridge?.clearOutput();
 function refresh(){container.hidden=!active;document.getElementById('editor')!.hidden=!!active;for(const name of ['project','console','problems','instructions'] as const)panels[name].hidden=name!==active;onChange();}
 const api={
  get active(){return active;},
  showInstruction(op:string){instructions.showInstruction(op);},
  show(name:PanelName){names.add(name);active=name;refresh();},
  remove(name:PanelName){names.delete(name);if(active===name)active=[...names][0];refresh();},
  showSource(){active=undefined;refresh();},
  renderTabs(strip:HTMLElement){for(const name of names){const wrapper=document.createElement('div');wrapper.className='editor-tab';const b=document.createElement('button');b.className='file-tab';b.textContent=name[0].toUpperCase()+name.slice(1);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(active===name));b.tabIndex=active===name?0:-1;b.onclick=()=>api.show(name);const close=document.createElement('button');close.className='tab-close';close.textContent='×';close.setAttribute('aria-label',b.textContent+' のタブを閉じる');close.onclick=()=>bridge?.closePanel(group,name);wrapper.append(b,close);strip.append(wrapper);}},
  update(state?:ToolState,files:DetachedState['files']=[]){const fileKey=JSON.stringify(files);if(fileKey!==lastFiles){lastFiles=fileKey;renderProjectTree(get('file-list'),files.map(file=>({path:file.title,key:file.key,open:()=>{const state=bridge?.openTab(group,file.key);if(state)bridge?.openDefinition(group,state.uri,{lineNumber:1,column:1});}})),bridge?.workspaceId??'',collapsed);}if(!state)return;const serialized=JSON.stringify(state);if(serialized===last)return;last=serialized;
   const output=get('popup-output');output.replaceChildren(...state.output.map(part=>{const span=document.createElement('span');span.className=part.stream;span.textContent=part.text;return span;}));output.scrollTop=output.scrollHeight;
   if(document.activeElement!==input)input.value=state.stdin;
   const problems=get('problems');problems.replaceChildren(...state.problems.map((item,index)=>{const li=document.createElement('li'),b=document.createElement('button');b.textContent=item.label;b.className=item.severity;b.onclick=()=>bridge?.problem(index,group);li.append(b);return li;}));panels.problems.querySelector<HTMLElement>('.empty-problems')!.hidden=state.problems.length>0;
  },
  dispose(){instructions.dispose();container.remove();}
 };return api;
}
