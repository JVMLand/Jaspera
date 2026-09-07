import {methodLayouts,graphDocuments,rememberGraph} from './graph-cache';
import {observePanelVisibility} from './panel-visibility';
import type {AnalysisProgress,Compilation,GraphDocument,MethodGraph} from './protocol';
import {WorkerRpc} from './worker-rpc';
import type {GraphLayoutApi} from './graph-layout.worker';
import type {positionGraphs} from './graph-layout';
import GraphWorker from './graph-layout.worker?worker';
import {instructionHighlightGroup} from './instruction-colors';
import {installContextMenu} from './context-menu';
import './instruction-graph.css';
type Layout=Awaited<ReturnType<typeof positionGraphs>>;
// Three completed stages: type/flow analysis, frame graph, and layout (not a time estimate).
interface MethodView {name:string;step:number;phase:string;group:SVGGElement;graph?:MethodGraph;layout?:Pick<Layout,'width'|'height'>}
export function installInstructionGraph(host:HTMLElement,compile:(doc:GraphDocument,onProgress?:(progress:AnalysisProgress)=>void)=>Promise<Compilation>,navigate:(doc:GraphDocument,line:number,column:number)=>void){
 const worker=new WorkerRpc<GraphLayoutApi>(()=>new GraphWorker());host.classList.add('instruction-graph');
 const status=document.createElement('p');status.className='graph-status';status.setAttribute('role','status');
 const filters=document.createElement('div');filters.className='graph-filters';const enabled=new Set(['stack','local','control','exception']);
 for(const [kind,title] of [['stack','スタック'],['local','ローカル変数'],['control','制御フロー'],['exception','例外']]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.onchange=()=>{input.checked?enabled.add(kind):enabled.delete(kind);relayout();};label.dataset.kind=kind;label.append(input,title);filters.append(label);}
 const ns=<K extends keyof SVGElementTagNameMap>(tag:K,attributes:Record<string,string|number>={},text?:string)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;};
 const svg=ns('svg',{class:'graph-canvas','aria-label':'命令グラフ'}),scene=ns('g');svg.append(scene);host.append(filters,status,svg);
 let doc:GraphDocument|undefined,methods:MethodView[]=[],ticket=0,layoutTicket=0,disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
 let owner='',stage='',failure='',layoutQueue=Promise.resolve();
 let width=1,height=1,scale=1,x=0,y=0,autoFit=true,drag:{x:number;y:number;left:number;top:number}|undefined;
 const transform=()=>scene.setAttribute('transform',`translate(${x},${y}) scale(${scale})`);
 const fit=()=>{const rect=svg.getBoundingClientRect();if(rect.width<1||rect.height<1)return;autoFit=false;scale=Math.max(.08,Math.min(1.4,(rect.width-24)/width,(rect.height-24)/height));x=(rect.width-width*scale)/2;y=12;transform();};
 const fitWidth=()=>{if(!svg.clientWidth)return;scale=Math.max(.08,Math.min(1,(svg.clientWidth-24)/width));x=(svg.clientWidth-width*scale)/2;y=12;transform();};
 const zoom=(factor:number,cx=svg.clientWidth/2,cy=svg.clientHeight/2)=>{autoFit=false;const next=Math.max(.08,Math.min(3,scale*factor));x=cx-(cx-x)*next/scale;y=cy-(cy-y)*next/scale;scale=next;transform();};
 function summary(){
  if(failure){status.textContent=failure;return;}
  const complete=methods.filter(m=>m.step===3).length,total=methods.length,percent=total?Math.floor(methods.reduce((sum,m)=>sum+m.step,0)/(3*total)*100):0;
  status.textContent=`${owner} · ${percent}% · ${complete}/${total} メソッド完了${complete===total&&total?'':stage?' · '+stage:''}`;
 }
 function highlight(){const at=methods.flatMap((method,index)=>(method.graph?.nodes??[]).filter(n=>n.line===doc?.line&&n.column<=(doc?.column??0)).map(n=>({...n,id:'m'+index+':'+n.id}))).at(-1);for(const node of scene.querySelectorAll<SVGGElement>('.graph-node'))node.classList.toggle('selected',node.dataset.id===at?.id);}
 function placeholder(method:MethodView){
  const percent=Math.floor(method.step/3*100),w=Math.max(420,Math.min(1000,method.name.length*7+32));const existing=method.group.querySelector('.graph-method-progress');
  if(existing){existing.setAttribute('width',String(w*percent/100));existing.setAttribute('aria-valuenow',String(percent));method.group.querySelector('.graph-method-state')!.textContent=`${method.phase} · ${percent}%`;return;}
  method.group.replaceChildren();
  method.group.append(ns('rect',{width:w,height:108,rx:8,class:'graph-block'}),ns('rect',{width:w*percent/100,height:108,rx:8,class:'graph-method-progress',role:'progressbar','aria-label':method.name,'aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':percent}),ns('text',{x:12,y:21,class:'graph-method'},method.name),ns('text',{x:12,y:65,class:'graph-method-state'},`${method.phase} · ${percent}%`));
 }
 function reflow(){let top=0;width=420;for(const method of methods){method.group.setAttribute('transform',`translate(0,${top})`);const w=method.layout?.width??Math.max(420,Math.min(1000,method.name.length*7+32));width=Math.max(width,w);top+=(method.layout?.height??108)+24;}height=Math.max(0,top-24);if(autoFit)fitWidth();summary();}
 function addMethod(name:string){const method:MethodView={name,step:0,phase:'解析の開始待ち',group:ns('g',{class:'graph-method-group'})};methods.push(method);scene.append(method.group);placeholder(method);return method;}
 function render(method:MethodView,placed:Layout){
  const index=methods.indexOf(method),prefix=(id:string)=>id.replace(/^m0:/,'m'+index+':');
  const result={...placed,nodes:placed.nodes.map(n=>({...n,id:prefix(n.id)})),edges:placed.edges.map(e=>({...e,from:prefix(e.from),to:prefix(e.to)}))};
  const group=method.group;group.replaceChildren();
   const arrowId='graph-arrow-'+crypto.randomUUID();const defs=ns('defs'),marker=ns('marker',{id:arrowId,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(ns('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(marker);group.append(defs);
   for(const box of result.boxes){group.append(ns('rect',{x:box.x,y:box.y,width:box.width,height:box.height,rx:8,class:'graph-block'}),ns('text',{x:box.x+12,y:box.y+21,class:'graph-method'},box.name));}
   for(const edge of result.edges){const points:{x:number;y:number}[]=edge.points??[];const path=ns('path',{d:points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '),class:'graph-edge '+edge.kind,'marker-end':`url(#${arrowId})`});path.append(ns('title',{},edge.kind+(edge.label?' · '+edge.label:'')));group.append(path);if(edge.label&&edge.x!==undefined)group.append(ns('text',{x:edge.x,y:edge.y!,'text-anchor':'middle',class:'graph-edge-label'},edge.label));}
   for(const node of result.nodes){const g=ns('g',{transform:`translate(${node.x-node.width/2},${node.y-node.height/2})`,class:'graph-node'+(node.unreachable?' unreachable':''),role:'button',tabindex:0,'aria-label':`${node.line}行: ${node.text}`});g.dataset.id=node.id;g.style.setProperty('--node-color',`var(--instruction-${instructionHighlightGroup(node.opcode)})`);g.append(ns('rect',{width:node.width,height:node.height,rx:5}),ns('text',{x:12,y:20},node.text.length>60?node.text.slice(0,57)+'…':node.text),ns('title',{},node.text));const go=()=>{if(doc)navigate(doc,node.line,node.column);};g.onclick=go;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};group.append(g);}

  method.layout={width:placed.width,height:placed.height};method.step=3;reflow();highlight();
 }
 function enqueueLayout(method:MethodView){
  const generation=layoutTicket;method.phase='配置待ち';method.step=2;placeholder(method);reflow();
  layoutQueue=layoutQueue.then(async()=>{
   if(disposed||generation!==layoutTicket||!method.graph)return;
   method.phase='配置中';placeholder(method);
   try{const graph={...method.graph,edges:method.graph.edges.filter(edge=>enabled.has(edge.kind))};const cached=methodLayouts.get(graph);const placed=cached??await worker.call(api=>api.positionGraphs([graph]));if(!cached)methodLayouts.set(graph,placed);if(!disposed&&generation===layoutTicket)render(method,placed);}
   catch(error){if(!disposed&&generation===layoutTicket){method.phase='配置できませんでした';placeholder(method);failure=String(error);summary();}}
  });
 }
 function acceptGraph(graph:MethodGraph){
  if(!graph.nodes.length)return;
  let method=methods.find(m=>m.name===graph.name);if(method?.graph)return;
  if(graph.nodes.length>600||methods.reduce((sum,m)=>sum+(m.graph?.nodes.length??0),0)+graph.nodes.length>2000){failure='表示の上限を超えています（1メソッド600命令、クラス全体2,000命令）。';summary();return;}
  method??=addMethod(graph.name);method.graph=graph;const cached=methodLayouts.get({...graph,edges:graph.edges.filter(edge=>enabled.has(edge.kind))});if(cached)render(method,cached);else enqueueLayout(method);
 }
 function progress(value:AnalysisProgress){
  const labels={queued:'解析待ち',loading:'JVM を読み込み中',parse:'構文解析',analysis:'型・フロー解析',frames:'フレーム解析',layout:'配置中',complete:'解析完了'};
  stage=value.phase==='queued'?(value.waitingFor??'先行する解析の完了待ち'):value.phase==='loading'&&value.total===0?'JVM を準備中':labels[value.phase];
  if(value.phase==='loading'&&value.total>0)stage+=` ${Math.floor(value.completed/value.total*100)}%`;
  if(value.method)stage+=` · ${value.method}`;
  const currentName=value.method?.split('(')[0];
  const waiting=value.phase==='analysis'?(currentName?`${currentName} の型・フロー解析待ち`:'クラスの型・フロー解析待ち'):value.phase==='frames'?(currentName?`${currentName} のフレーム解析待ち`:'フレーム解析の開始待ち'):stage;
  for(const pending of methods)if(!pending.graph&&!pending.layout&&pending.name!==value.method){pending.phase=waiting;placeholder(pending);}
  if(value.owner)owner=value.owner;
  const method=methods.find(m=>m.name===value.method);
  if(method&&!method.layout&&!method.graph){method.phase=labels[value.phase];if(value.phase==='analysis'&&value.finished){method.step=1;method.phase='クラス全体の型解析の完了待ち';}if(value.phase==='frames')method.step=1;placeholder(method);}
  if(value.graph)acceptGraph(value.graph);summary();
 }
 function relayout(){if(!methods.some(m=>m.graph))return;++layoutTicket;worker.stop();layoutQueue=Promise.resolve();for(const method of methods)if(method.graph){method.layout=undefined;enqueueLayout(method);}reflow();}
 const wheel=(event:WheelEvent)=>{event.preventDefault();const rect=svg.getBoundingClientRect();zoom(event.deltaY<0?1.1:1/1.1,event.clientX-rect.left,event.clientY-rect.top);};svg.addEventListener('wheel',wheel,{passive:false});
 svg.onpointerdown=e=>{if(e.button!==0||(e.target as Element).closest('.graph-node'))return;autoFit=false;drag={x:e.clientX,y:e.clientY,left:x,top:y};svg.setPointerCapture(e.pointerId);};svg.onpointermove=e=>{if(drag){x=drag.left+e.clientX-drag.x;y=drag.top+e.clientY-drag.y;transform();}};svg.onpointerup=svg.onpointercancel=()=>{drag=undefined;};
 const resize=new ResizeObserver(()=>{if(svg.clientWidth&&svg.clientHeight)fitWidth();});resize.observe(svg);
 const context=installContextMenu(host,()=>[{label:'全体表示',action:fit},{label:'再解析',action:()=>{const previous=doc;if(previous)graphDocuments.delete(previous.source);doc=undefined;update(previous);}}]);
 function refresh(next?:GraphDocument){
  const same=next?.uri===doc?.uri&&next?.version===doc?.version;doc=next;if(same&&next){highlight();return;}
  clearTimeout(timer);const id=++ticket;++layoutTicket;worker.stop();layoutQueue=Promise.resolve();scene.replaceChildren();methods=[];failure='';autoFit=true;
  if(!next){status.textContent='JAL ファイルを開いてください。';return;}
  owner=next.uri.split('/').at(-1)??'';stage='メソッドを読み取り中';summary();
  const cached=graphDocuments.get(next.source);if(cached){owner=cached.owner;for(const graph of cached.graphs)acceptGraph(graph);summary();return;}
  timer=setTimeout(()=>{void (async()=>{
   const outline=await worker.call(api=>api.outline(next.source));if(disposed||id!==ticket)return;
   if(outline[0])owner=outline[0].owner;for(const method of outline)addMethod(method.name);reflow();
   const result=await compile(next,value=>{if(!disposed&&id===ticket)progress(value);});rememberGraph(next.source,result);if(disposed||id!==ticket)return;
   for(const graph of result.graphs??[])acceptGraph(graph);
   failure=result.diagnostics.find(d=>d.severity==='error')?.message??failure;
   if(!methods.length&&!failure)failure='表示できる命令がありません。';
   if(failure)for(const method of methods)if(!method.graph){method.phase='解析できませんでした';placeholder(method);}
   summary();
  })().catch(error=>{if(!disposed&&id===ticket){failure=String(error);summary();}});},180);
 }
 let visible=false,pending:GraphDocument|undefined;
 function update(next?:GraphDocument){pending=next;if(visible)refresh(next);}
 const visibility=observePanelVisibility(host,value=>{visible=value;if(value)refresh(pending);});
 return {update,dispose(){visibility.dispose();disposed=true;ticket++;layoutTicket++;clearTimeout(timer);resize.disconnect();context.dispose();worker.dispose();host.replaceChildren();}};
}
