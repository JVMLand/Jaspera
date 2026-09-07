// Shared by workspace groups and detached windows.
export const TAB_HOLD_MS=160;
const MIME='application/x-jalweb-tab';
export function fileDrag(node:HTMLElement,workspace:string,key:string){
 node.draggable=true;
 node.addEventListener('dragstart',event=>{if(!event.dataTransfer)return;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(MIME,JSON.stringify({workspace,key}));});
}
export function fileDrop(node:HTMLElement,workspace:string,open:(key:string,event:DragEvent)=>void){
 const controller=new AbortController(),options={signal:controller.signal};
 node.addEventListener('dragover',e=>{if(!e.dataTransfer?.types.includes(MIME))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';node.classList.add('dock-drop-target');},options);
 node.addEventListener('dragleave',e=>{if(!node.contains(e.relatedTarget as Node))node.classList.remove('dock-drop-target');},options);
 node.addEventListener('drop',e=>{node.classList.remove('dock-drop-target');const data=e.dataTransfer?.getData(MIME);if(!data)return;e.preventDefault();e.stopPropagation();try{const item=JSON.parse(data);if(item.workspace===workspace&&typeof item.key==='string')open(item.key,e);}catch{}},options);
 return {dispose(){controller.abort();node.classList.remove('dock-drop-target');}};
}
export function holdDrag(button:HTMLElement,label:string,move:(x:number,y:number)=>void,drop:(x:number,y:number)=>void){
 let suppress=false,cancel:(()=>void)|undefined;
 button.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();}},true);
 button.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.altKey)return;cancel?.();let dragging=false,moved=false,ghost:HTMLElement|undefined;
  const control=new AbortController(),options={signal:control.signal};
  const clean=()=>{clearTimeout(timer);control.abort();ghost?.remove();document.querySelectorAll('.dock-drop-target').forEach(n=>n.classList.remove('dock-drop-target'));if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);cancel=undefined;};cancel=clean;
  const timer=setTimeout(()=>{dragging=true;ghost=document.createElement('div');ghost.className='tab-drag-ghost';ghost.textContent=label;ghost.style.left=e.clientX+12+'px';ghost.style.top=e.clientY+12+'px';document.body.append(ghost);},TAB_HOLD_MS);
  button.setPointerCapture(e.pointerId);
  document.addEventListener('pointermove',event=>{if(event.pointerId!==e.pointerId)return;const distance=Math.hypot(event.clientX-e.clientX,event.clientY-e.clientY);if(!dragging){if(distance>8)clean();return;}moved ||= distance>6;ghost!.style.left=event.clientX+12+'px';ghost!.style.top=event.clientY+12+'px';move(event.clientX,event.clientY);},options);
  document.addEventListener('pointerup',event=>{if(event.pointerId!==e.pointerId)return;if(dragging){suppress=true;setTimeout(()=>suppress=false,0);}clean();if(dragging&&moved)drop(event.clientX,event.clientY);},options);
  document.addEventListener('pointercancel',clean,options);window.addEventListener('blur',clean,options);document.addEventListener('keydown',event=>{if(event.key==='Escape')clean();},options);
 });return {dispose(){cancel?.();}};
}
