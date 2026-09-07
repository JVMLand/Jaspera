import {installContextMenu,copyText} from './context-menu';
import {paneDrag} from './tab-interactions';
const contexts=new WeakSet<HTMLElement>();
export interface TreeFile {path:string;key:string;active?:boolean;open:()=>void}
export function renderProjectTree(host:HTMLElement,files:TreeFile[],workspace:string,collapsed=new Set<string>()){
 const surface=host.closest<HTMLElement>('#project-panel,#popup-project')??host;
 if(!contexts.has(surface)){contexts.add(surface);installContextMenu(surface,()=>[
  {label:'すべて展開',action:()=>{for(const folder of host.querySelectorAll<HTMLDetailsElement>('details'))folder.open=true;}},
  {label:'すべて折りたたむ',action:()=>{for(const folder of host.querySelectorAll<HTMLDetailsElement>('details'))folder.open=false;}}
 ]);}
 type Node={folders:Map<string,Node>;files:TreeFile[]};const root:Node={folders:new Map(),files:[]};host.replaceChildren();
 for(const file of files){const parts=file.path.split('/');parts.pop();let node=root;for(const part of parts){if(!node.folders.has(part))node.folders.set(part,{folders:new Map(),files:[]});node=node.folders.get(part)!;}node.files.push(file);}
 const render=(node:Node,parent:HTMLElement,prefix:string)=>{for(const [name,child] of [...node.folders].sort(([a],[b])=>a.localeCompare(b))){const path=prefix+name,details=document.createElement('details'),summary=document.createElement('summary'),children=document.createElement('div');details.className='file-folder';details.open=!collapsed.has(path);summary.textContent=name;summary.title=path;installContextMenu(summary,()=>[{label:details.open?'折りたたむ':'展開する',action:()=>{details.open=!details.open;}},{label:'相対パスをコピー',action:()=>copyText(path)}]);children.className='folder-children';details.append(summary,children);parent.append(details);render(child,children,path+'/');details.ontoggle=()=>{if(details.isConnected){if(details.open)collapsed.delete(path);else collapsed.add(path);}};}
 for(const file of node.files.sort((a,b)=>a.path.localeCompare(b.path))){const button=document.createElement('button');button.textContent=file.path.split('/').pop()!;button.title=file.path;button.className=file.active?'selected':'';button.setAttribute('aria-current',String(!!file.active));button.onclick=file.open;installContextMenu(button,()=>[{label:'開く',action:file.open},{label:'相対パスをコピー',action:()=>copyText(file.path)}]);if(file.key)paneDrag(button,workspace,file.key);parent.append(button);}};render(root,host,'');
}
