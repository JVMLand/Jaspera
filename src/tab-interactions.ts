// Shared by workspace groups and detached windows.
const MIME='application/x-jalweb-tab';
export function paneDrag(node:HTMLElement,workspace:string,key:string){
 node.draggable=true;let dragging=false;
 node.addEventListener('click',e=>{if(dragging){e.preventDefault();e.stopImmediatePropagation();}},true);
 node.addEventListener('dragend',()=>{setTimeout(()=>dragging=false,0);node.ownerDocument.querySelectorAll('.dock-drop-target').forEach(n=>n.classList.remove('dock-drop-target'));});
 node.addEventListener('dragstart',event=>{if(!event.dataTransfer)return;dragging=true;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(MIME,JSON.stringify({workspace,key}));});
}
export function paneDrop(node:HTMLElement,workspace:string,open:(key:string,event:DragEvent)=>void){
 const controller=new AbortController(),options={signal:controller.signal};
 node.addEventListener('dragover',e=>{if(!e.dataTransfer?.types.includes(MIME))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';node.classList.add('dock-drop-target');},options);
 node.addEventListener('dragleave',e=>{if(!node.contains(e.relatedTarget as Node))node.classList.remove('dock-drop-target');},options);
 node.addEventListener('drop',e=>{node.ownerDocument.querySelectorAll('.dock-drop-target').forEach(n=>n.classList.remove('dock-drop-target'));const data=e.dataTransfer?.getData(MIME);if(!data)return;e.preventDefault();e.stopPropagation();let item:unknown;try{item=JSON.parse(data);}catch{return;}if(item&&typeof item==='object'&&'workspace' in item&&item.workspace===workspace&&'key' in item&&typeof item.key==='string')open(item.key,e);},options);
 return {dispose(){controller.abort();node.classList.remove('dock-drop-target');}};
}
