import {simplifyGraphRoutes} from './simplify-graph-routes';
import {straightenGraphEdges} from './straighten-graph-edges';
import type {ELK,ElkNode,ElkPoint} from 'elkjs/lib/elk-api';
import type {MethodGraph,GraphEdge,GraphNode} from './protocol';
interface PlacedNode extends GraphNode {x:number;y:number;width:number;height:number}
interface PlacedEdge extends GraphEdge {points:ElkPoint[];x?:number;y?:number}
interface BlockBox {id:string;x:number;y:number;width:number;height:number}
interface MethodBox {name:string;x:number;y:number;width:number;height:number}

// Seed a shared center line; interactive placement preserves it while ELK routes
// around the actual instruction widths. Each label block gets its own column.
const columnNode=(node:GraphNode,index:number)=>{
 const width=Math.min(460,Math.max(110,node.text.length*7+24));
 return {id:node.id,width,height:30,x:230-width/2,y:index*62};
};

/** ELK routes orthogonal edges while placing nodes, instead of adding elbows afterwards. */
export async function positionGraphs(methods:MethodGraph[],elk:Pick<ELK,'layout'>){
 const nodes:PlacedNode[]=[],edges:PlacedEdge[]=[],boxes:MethodBox[]=[],blocks:BlockBox[]=[];
 let width=0,top=0;
 for(const [index,method] of methods.entries()){
  const nodeStart=nodes.length,edgeStart=edges.length,blockStart=blocks.length;
  const grouped=new Map<string,GraphNode[]>();for(const node of method.nodes){const id=node.block??'B0';grouped.set(id,[...(grouped.get(id)??[]),node]);}
  const compound=grouped.size>1||method.edges.some(e=>e.kind==='exception');
  const graph:ElkNode={id:'method',layoutOptions:{
   'elk.hierarchyHandling':'INCLUDE_CHILDREN',
   ...(!compound?{'elk.layered.nodePlacement.strategy':'INTERACTIVE'}:{}),
   'elk.algorithm':'layered','elk.direction':'DOWN','elk.edgeRouting':'ORTHOGONAL',
   'elk.padding':'[top=24,left=24,bottom=24,right=24]',
   'elk.spacing.nodeNode':'24','elk.layered.spacing.nodeNodeBetweenLayers':'32',
   'elk.layered.nodePlacement.favorStraightEdges':'true',
   'elk.layered.unnecessaryBendpoints':'false',
   'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES'
  },children:method.nodes.map(columnNode),
  edges:method.edges.map((edge,i)=>({id:'e'+i,sources:[edge.from],targets:[edge.to],...(edge.label?{labels:[{text:edge.label,width:Math.max(...edge.label.split('\n').map(line=>line.length*6)),height:edge.label.split('\n').length*14}]}:{})}))};
  if(compound)graph.children=[...grouped].map(([id,items])=>({id,layoutOptions:{'elk.padding':'[top=18,left=18,bottom=18,right=18]','elk.layered.nodePlacement.strategy':'INTERACTIVE'},children:items.map(columnNode)}));
  // Filtering arrows must not remove the instruction order within a block.
  const linked=new Set(method.edges.map(e=>JSON.stringify([e.from,e.to])));
  for(const items of grouped.values())for(let i=1;i<items.length;i++){
   const from=items[i-1].id,to=items[i].id;
   if(!linked.has(JSON.stringify([from,to])))graph.edges!.push({id:'order:'+from+':'+to,sources:[from],targets:[to]});
  }
  const result=await elk.layout(graph);
  if(!compound)straightenGraphEdges(result);
  const prefix='m'+index+':',offset=top+30;
  const geometry=new Map<string,{x:number;y:number;width:number;height:number}>();
  const routes:{route:NonNullable<ElkNode['edges']>[number];x:number;y:number}[]=[];
  const visit=(parent:ElkNode,x:number,y:number)=>{
   for(const child of parent.children??[]){const cx=x+(child.x??0),cy=y+(child.y??0);
    geometry.set(child.id,{x:cx,y:cy,width:child.width!,height:child.height!});
    if(child.children){blocks.push({id:prefix+child.id,x:cx,y:cy+offset,width:child.width!,height:child.height!});visit(child,cx,cy);}
   }
   for(const route of parent.edges??[])routes.push({route,x,y});
  };visit(result,0,0);
  if(compound)for(const child of result.children??[])if(child.children)straightenGraphEdges({...child,edges:routes.filter(item=>item.route.container===child.id).map(item=>item.route)});
  for(const node of method.nodes){const position=geometry.get(node.id)!;nodes.push({...node,id:prefix+node.id,x:position.x+position.width/2,y:position.y+position.height/2+offset,width:position.width,height:position.height});}
  if(!compound&&method.nodes.length){const positions=[...geometry.values()],x=Math.min(...positions.map(p=>p.x))-12,y=Math.min(...positions.map(p=>p.y))-12;
   blocks.push({id:prefix+[...grouped.keys()][0],x,y:y+offset,width:Math.max(...positions.map(p=>p.x+p.width))-x+12,height:Math.max(...positions.map(p=>p.y+p.height))-y+12});}
  for(const {route,x:parentX,y:parentY} of routes){if(route.id.startsWith('order:'))continue;const container=route.container?geometry.get(route.container):undefined,x=container?.x??parentX,y=container?.y??parentY;const edge=method.edges[Number(route.id.slice(1))],label=route.labels?.[0];
   for(const section of route.sections??[])edges.push({...edge,from:prefix+edge.from,to:prefix+edge.to,points:[section.startPoint,...section.bendPoints??[],section.endPoint].map(point=>({x:point.x+x,y:point.y+y+offset})),...(label?{x:label.x!+label.width!/2+x,y:label.y!+y+offset+10}:{})});
  }
  const w=Math.max(result.width??0,method.name.length*7+32),h=(result.height??0)+30;
  const methodNodes=nodes.slice(nodeStart),methodBlocks=blocks.slice(blockStart);
  simplifyGraphRoutes([...methodNodes.map(n=>({id:n.id,x:n.x-n.width/2,y:n.y-n.height/2,width:n.width,height:n.height})),...methodBlocks],edges.slice(edgeStart),new Map(methodNodes.map(n=>[n.id,prefix+n.block])),{x:0,y:top,width:w,height:h});
  boxes.push({name:method.name,x:0,y:top,width:w,height:h});width=Math.max(width,w);top+=h+24;
 }
 return {width,height:Math.max(0,top-24),nodes,edges,boxes,blocks};
}
