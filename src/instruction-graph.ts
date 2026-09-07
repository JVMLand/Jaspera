import {observePanelVisibility} from './panel-visibility';
import type {Compilation,GraphDocument,MethodGraph} from './protocol';
import {WorkerRpc} from './worker-rpc';
import type {GraphLayoutApi} from './graph-layout.worker';
import GraphWorker from './graph-layout.worker?worker';
import {instructionHighlightGroup} from './instruction-colors';
import {installContextMenu} from './context-menu';
import './instruction-graph.css';
export function installInstructionGraph(host:HTMLElement,compile:(doc:GraphDocument)=>Promise<Compilation>,navigate:(doc:GraphDocument,line:number,column:number)=>void){
 const worker=new WorkerRpc<GraphLayoutApi>(()=>new GraphWorker());
 host.classList.add('instruction-graph');
 const status=document.createElement('p');status.className='graph-status';status.setAttribute('role','status');
 const filters=document.createElement('div');filters.className='graph-filters';const enabled=new Set(['stack','local','control','exception']);
 for(const [kind,title] of [['stack','スタック'],['local','ローカル変数'],['control','制御フロー'],['exception','例外']]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.onchange=()=>{input.checked?enabled.add(kind):enabled.delete(kind);void draw();};label.dataset.kind=kind;label.append(input,title);filters.append(label);}
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('graph-canvas');svg.setAttribute('aria-label','命令グラフ');
 const scene=document.createElementNS(svg.namespaceURI,'g') as SVGGElement;svg.append(scene);
 const ns=<K extends keyof SVGElementTagNameMap>(tag:K,attributes:Record<string,string|number>={},text?:string)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;};
 let doc:GraphDocument|undefined,graphs:MethodGraph[]=[],ticket=0,layoutTicket=0,disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
 let width=1,height=1,scale=1,x=0,y=0,drag:{x:number;y:number;left:number;top:number}|undefined;
 const transform=()=>scene.setAttribute('transform',`translate(${x},${y}) scale(${scale})`);
 const fit=()=>{const rect=svg.getBoundingClientRect();if(rect.width<1||rect.height<1)return;scale=Math.max(.08,Math.min(1.4,(rect.width-24)/width,(rect.height-24)/height));x=(rect.width-width*scale)/2;y=12;transform();};
 const fitWidth=()=>{if(!svg.clientWidth)return;scale=Math.max(.08,Math.min(1,(svg.clientWidth-24)/width));x=(svg.clientWidth-width*scale)/2;y=12;transform();};
 const zoom=(factor:number,cx=svg.clientWidth/2,cy=svg.clientHeight/2)=>{const next=Math.max(.08,Math.min(3,scale*factor));x=cx-(cx-x)*next/scale;y=cy-(cy-y)*next/scale;scale=next;transform();};
 host.append(filters,status,svg);
 function highlight(){const at=graphs.flatMap((method,index)=>method.nodes.filter(n=>n.line===doc?.line&&n.column<=(doc?.column??0)).map(n=>({...n,id:'m'+index+':'+n.id}))).at(-1);for(const node of scene.querySelectorAll<SVGGElement>('.graph-node'))node.classList.toggle('selected',node.dataset.id===at?.id);}
 async function draw(){
  const id=++layoutTicket;scene.replaceChildren();if(!graphs.length)return;
  if(graphs.some(m=>m.nodes.length>600)||graphs.reduce((n,m)=>n+m.nodes.length,0)>2000){status.textContent='表示の上限を超えています（1メソッド600命令、クラス全体2,000命令）。';return;}
  try{const result=await worker.call(api=>api.positionGraphs(graphs.map(method=>({...method,edges:method.edges.filter(e=>enabled.has(e.kind))}))));if(disposed||id!==layoutTicket)return;
   width=result.width;height=result.height;scene.replaceChildren();
   const arrowId='graph-arrow-'+crypto.randomUUID();const defs=ns('defs'),marker=ns('marker',{id:arrowId,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(ns('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(marker);scene.append(defs);
   for(const box of result.boxes){scene.append(ns('rect',{x:box.x,y:box.y,width:box.width,height:box.height,rx:8,class:'graph-block'}),ns('text',{x:box.x+12,y:box.y+21,class:'graph-method'},box.name));}
   for(const edge of result.edges){const points:{x:number;y:number}[]=edge.points??[];const path=ns('path',{d:points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '),class:'graph-edge '+edge.kind,'marker-end':`url(#${arrowId})`});path.append(ns('title',{},edge.kind+(edge.label?' · '+edge.label:'')));scene.append(path);if(edge.label&&edge.x!==undefined)scene.append(ns('text',{x:edge.x,y:edge.y!,'text-anchor':'middle',class:'graph-edge-label'},edge.label));}
   for(const node of result.nodes){const g=ns('g',{transform:`translate(${node.x-node.width/2},${node.y-node.height/2})`,class:'graph-node'+(node.unreachable?' unreachable':''),role:'button',tabindex:0,'aria-label':`${node.line}行: ${node.text}`});g.dataset.id=node.id;g.style.setProperty('--node-color',`var(--instruction-${instructionHighlightGroup(node.opcode)})`);g.append(ns('rect',{width:node.width,height:node.height,rx:5}),ns('text',{x:12,y:20},node.text.length>60?node.text.slice(0,57)+'…':node.text),ns('title',{},node.text));const go=()=>{if(doc)navigate(doc,node.line,node.column);};g.onclick=go;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};scene.append(g);}
   status.textContent='';highlight();fitWidth();
  }catch(error){if(!disposed&&id===layoutTicket)status.textContent=error instanceof Error?error.message:String(error);}
 }
 const wheel=(event:WheelEvent)=>{event.preventDefault();const rect=svg.getBoundingClientRect();zoom(event.deltaY<0?1.1:1/1.1,event.clientX-rect.left,event.clientY-rect.top);};svg.addEventListener('wheel',wheel,{passive:false});
 svg.onpointerdown=e=>{if(e.button!==0||(e.target as Element).closest('.graph-node'))return;drag={x:e.clientX,y:e.clientY,left:x,top:y};svg.setPointerCapture(e.pointerId);};svg.onpointermove=e=>{if(drag){x=drag.left+e.clientX-drag.x;y=drag.top+e.clientY-drag.y;transform();}};svg.onpointerup=svg.onpointercancel=()=>{drag=undefined;};
 const resize=new ResizeObserver(()=>{if(svg.clientWidth&&svg.clientHeight)fitWidth();});resize.observe(svg);
 const context=installContextMenu(host,()=>[{label:'全体表示',action:fit},{label:'再解析',action:()=>{const previous=doc;doc=undefined;update(previous);}}]);
 function refresh(next?:GraphDocument){
  const same=next?.uri===doc?.uri&&next?.version===doc?.version;doc=next;
  if(same&&next){highlight();return;}
  clearTimeout(timer);const id=++ticket;++layoutTicket;scene.replaceChildren();graphs=[];
  if(!next){status.textContent='JAL ファイルを開いてください。';return;}status.textContent='解析中…';
  timer=setTimeout(()=>{void compile(next).then(result=>{
   if(disposed||id!==ticket)return;graphs=(result.graphs??[]).filter(m=>m.nodes.length>0);
   if(!graphs.length){status.textContent=result.diagnostics.find(d=>d.severity==='error')?.message??'表示できる命令がありません。';return;}
   void draw();
  }).catch(error=>{if(!disposed&&id===ticket)status.textContent=String(error);});},180);
 }
 let visible=false,pending:GraphDocument|undefined;
 function update(next?:GraphDocument){pending=next;if(visible)refresh(next);}
 const visibility=observePanelVisibility(host,value=>{visible=value;if(value)refresh(pending);});
 return {update,dispose(){visibility.dispose();disposed=true;ticket++;layoutTicket++;clearTimeout(timer);resize.disconnect();context.dispose();worker.dispose();host.replaceChildren();}};
}
