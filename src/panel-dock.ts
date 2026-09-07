import './panel-dock.css';
import {holdDrag} from './tab-interactions';
import {installGroupResize} from './group-resize';
export const panelNames=['project','console','problems','instructions'] as const;
export type PanelName=typeof panelNames[number];
export type Side='project'|'source'|'output';
const sides=['project','source','output'] as const;
export function installPanelDock(onSelect:(name:PanelName)=>void,onLayout:()=>void,closeSources:(side:Side)=>void,detach?:(name:PanelName)=>void){
 const get=(id:string)=>document.getElementById(id)!;
 const workspace=document.querySelector<HTMLElement>('.workspace')!;
 const panes={project:document.querySelector<HTMLElement>('.project-pane')!,source:document.querySelector<HTMLElement>('.source-pane')!,output:document.querySelector<HTMLElement>('.output-pane')!};
 const projectBody=document.createElement('div');projectBody.id='project-panel';projectBody.setAttribute('role','tabpanel');projectBody.append(get('file-list'));
 const projectHeader=document.querySelector<HTMLElement>('.project-heading')!;const add=get('add-file');projectHeader.replaceChildren();const projectStrip=document.createElement('div');projectStrip.id='project-tabs';projectStrip.className='tabs';projectStrip.setAttribute('role','tablist');const projectButton=document.createElement('button');projectButton.id='project-tab';projectButton.textContent='PROJECT';projectButton.setAttribute('role','tab');projectStrip.append(projectButton);projectHeader.append(projectStrip);projectBody.prepend(add);panes.project.append(projectBody);
 const strips:Record<Side,HTMLElement>={project:projectStrip,source:get('file-tabs'),output:document.querySelector<HTMLElement>('.output-header .tabs')!};
 const order:Record<Side,PanelName[]>={project:['project'],source:[],output:['console','problems','instructions']};
 const selected:Record<Side,PanelName|null>={project:'project',source:null,output:'console'};
 const closed=new Set<PanelName>();
 const panels=Object.fromEntries(panelNames.map(n=>[n,get(n+'-panel')])) as Record<PanelName,HTMLElement>;
 const buttons=Object.fromEntries(panelNames.map(n=>[n,get(n+'-tab')])) as Record<PanelName,HTMLElement>;
 const nodes={} as Record<PanelName,HTMLElement>;
 const disposals:(()=>void)[]=[];
 const contents={project:document.createElement('div'),source:document.createElement('div'),output:document.createElement('div')};
 const extras=[document.querySelector<HTMLElement>('.stdin-section')!,document.querySelector<HTMLElement>('.runtime-card')!,get('clear')];
 // Console owns its input and runtime information even after being moved.
 const consoleBody=document.createElement('div');consoleBody.className='dock-console-body';
 const consoleContainer=panels.console;while(consoleContainer.firstChild)consoleBody.append(consoleContainer.firstChild);
 consoleContainer.append(consoleBody,...extras);consoleContainer.classList.add('dock-console');
 for(const side of sides){contents[side].className='dock-content';panes[side].append(contents[side]);panes[side].classList.add('dock-pane');}
 function sideOf(name:PanelName):Side{return sides.find(side=>order[side].includes(name))!;}
 function refresh(){
  for(const side of sides){
   const active=selected[side];
   for(const name of order[side]){strips[side].append(nodes[name]);nodes[name].hidden=closed.has(name);const chosen=name===active&&!closed.has(name);buttons[name].setAttribute('aria-selected',String(chosen));buttons[name].tabIndex=chosen?0:-1;contents[side].append(panels[name]);panels[name].hidden=!chosen;}
   panes[side].classList.toggle('dock-tool-active',active!==null);
   panes[side].classList.toggle('instructions-open',active==='instructions');
   contents[side].hidden=active===null;
   panes[side].querySelector<HTMLElement>('.group-editor')?.toggleAttribute('hidden',active!==null);
  }
  for(const side of sides)for(const b of strips[side].querySelectorAll<HTMLElement>('[data-tab-key] [role=tab]')){b.dataset.editorSelected??=b.getAttribute('aria-selected')??'false';const active=selected[side]===null&&b.dataset.editorSelected==='true';b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
  extras[2].hidden=false;
  onLayout();
 }
 function show(name:PanelName){closed.delete(name);selected[sideOf(name)]=name;onSelect(name);refresh();buttons[name].scrollIntoView({block:'nearest',inline:'nearest'});}
 function showSource(side:Side='source'){selected[side]=null;refresh();}
 function close(name:PanelName){const side=sideOf(name);closed.add(name);if(selected[side]===name)selected[side]=order[side].find(n=>!closed.has(n))??null;refresh();}
 function closeOthers(name:PanelName){const side=sideOf(name);for(const n of order[side])if(n!==name)closed.add(n);closeSources(side);show(name);}
 function move(name:PanelName,side:Side,before?:PanelName){const old=sideOf(name);order[old]=order[old].filter(n=>n!==name);if(selected[old]===name)selected[old]=order[old].find(n=>!closed.has(n))??null;const at=before?order[side].indexOf(before):-1;order[side].splice(at<0?order[side].length:at,0,name);workspace.classList.add('dock-arranged');show(name);}
 let menu:HTMLElement|undefined;
 function dismiss(){menu?.remove();menu=undefined;}
 function context(name:PanelName,x:number,y:number){
  dismiss();menu=document.createElement('div');menu.className='dock-menu';menu.setAttribute('role','menu');
  const items:[string,()=>void][]=[['PROJECT グループへ移動',()=>move(name,'project')],['左側へ移動',()=>move(name,workspace.classList.contains('dock-swapped')?'output':'source')],['右側へ移動',()=>move(name,workspace.classList.contains('dock-swapped')?'source':'output')],['小窓で開く',()=>detach?.(name)],['このタブを閉じる',()=>close(name)],['他のタブを閉じる',()=>closeOthers(name)]];
  for(const [label,action] of items){const b=document.createElement('button');b.textContent=label;b.setAttribute('role','menuitem');b.onclick=()=>{dismiss();action();};menu.append(b);}
  document.body.append(menu);menu.style.left=Math.min(x,innerWidth-menu.offsetWidth-8)+'px';menu.style.top=Math.min(y,innerHeight-menu.offsetHeight-8)+'px';menu.querySelector('button')?.focus();
 }
 function hit(x:number,y:number){return sides.find(side=>{const b=panes[side].getBoundingClientRect();return x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom;});}
 function highlight(x:number,y:number){const side=hit(x,y);for(const s of sides)panes[s].classList.toggle('dock-drop-target',s===side);return side;}
 for(const name of panelNames){
  const wrapper=document.createElement('div');wrapper.className='dock-tab';wrapper.dataset.panel=name;wrapper.setAttribute('role','presentation');nodes[name]=wrapper;
  const b=buttons[name];b.classList.add('dock-tab-button');b.title='長押し: 移動 / 右クリック: 配置と閉じる / Alt＋クリック: 他のタブを閉じる';b.onclick=e=>{e.altKey?closeOthers(name):show(name);};const drag=holdDrag(b,b.textContent??name,highlight,(x,y)=>{const side=hit(x,y);if(side){const before=order[side].find(n=>n!==name&&x<nodes[n].getBoundingClientRect().left+nodes[n].offsetWidth/2);move(name,side,before);}else detach?.(name);});disposals.push(()=>drag.dispose());b.oncontextmenu=e=>{e.preventDefault();context(name,e.clientX,e.clientY);};
  b.onkeydown=e=>{if(e.key==='Delete'){e.preventDefault();close(name);return;}if(e.key==='F10'&&e.shiftKey){e.preventDefault();const box=b.getBoundingClientRect();context(name,box.left,box.bottom);return;}if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const tabs=[...strips[sideOf(name)].querySelectorAll<HTMLElement>('[role=tab]')].filter(t=>!t.closest('[hidden]')),i=tabs.indexOf(b),at=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[at]?.click();tabs[at]?.focus();};
  const x=document.createElement('button');x.className='dock-tab-close';x.textContent='×';x.setAttribute('aria-label',name[0].toUpperCase()+name.slice(1)+' のタブを閉じる');x.onclick=e=>e.altKey?closeOthers(name):close(name);wrapper.append(b,x);
 }
 const sourceKeys=(e:KeyboardEvent)=>{
  if(!(e.target instanceof HTMLElement)||!e.target.closest('[data-tab-key]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();e.stopImmediatePropagation();const strip=Object.values(strips).find(strip=>strip.contains(e.target as Node))!;const tabs=[...strip.querySelectorAll<HTMLElement>('[role=tab]')].filter(t=>!t.closest('[hidden]')),i=tabs.indexOf(e.target),at=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[at]?.click();tabs[at]?.focus();
 };
 for(const strip of Object.values(strips)){strip.addEventListener('keydown',sourceKeys,true);disposals.push(()=>strip.removeEventListener('keydown',sourceKeys,true));}
 const outside=(e:PointerEvent)=>{if(!menu?.contains(e.target as Node))dismiss();};document.addEventListener('pointerdown',outside);disposals.push(()=>document.removeEventListener('pointerdown',outside));
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape')dismiss();};document.addEventListener('keydown',key);disposals.push(()=>document.removeEventListener('keydown',key));
 workspace.classList.add('dock-arranged');const resize=installGroupResize(workspace,onLayout);disposals.push(()=>resize.dispose());refresh();
 return {show,close,showSource,refresh,move,hit,highlight,panes,strips,selected,swap(){workspace.classList.add('dock-arranged');workspace.classList.toggle('dock-swapped');onLayout();},dispose(){dismiss();for(const dispose of disposals)dispose();}};
}
