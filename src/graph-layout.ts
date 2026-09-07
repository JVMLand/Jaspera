import {straightenGraphEdges} from './straighten-graph-edges';
import type {ELK,ElkNode,ElkPoint} from 'elkjs/lib/elk-api';
import type {MethodGraph,GraphEdge,GraphNode} from './protocol';
interface PlacedNode extends GraphNode {x:number;y:number;width:number;height:number}
interface PlacedEdge extends GraphEdge {points:ElkPoint[];x?:number;y?:number}
interface MethodBox {name:string;x:number;y:number;width:number;height:number}

/** ELK routes orthogonal edges while placing nodes, instead of adding elbows afterwards. */
export async function positionGraphs(methods:MethodGraph[],elk:Pick<ELK,'layout'>){
 const nodes:PlacedNode[]=[],edges:PlacedEdge[]=[],boxes:MethodBox[]=[];
 let width=0,top=0;
 for(const [index,method] of methods.entries()){
  const graph:ElkNode={id:'method',layoutOptions:{
   'elk.algorithm':'layered','elk.direction':'DOWN','elk.edgeRouting':'ORTHOGONAL',
   'elk.padding':'[top=24,left=24,bottom=24,right=24]',
   'elk.spacing.nodeNode':'24','elk.layered.spacing.nodeNodeBetweenLayers':'32',
   'elk.layered.nodePlacement.favorStraightEdges':'true',
   'elk.layered.unnecessaryBendpoints':'false',
   'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES'
  },children:method.nodes.map(node=>({id:node.id,width:Math.min(460,Math.max(110,node.text.length*7+24)),height:30})),
  edges:method.edges.map((edge,i)=>({id:'e'+i,sources:[edge.from],targets:[edge.to],...(edge.label?{labels:[{text:edge.label,width:Math.min(180,edge.label.length*6),height:12}]}:{})}))};
  const result=await elk.layout(graph);straightenGraphEdges(result);
  const prefix='m'+index+':',offset=top+30;
  const geometry=new Map(result.children?.map(node=>[node.id,node]));
  for(const node of method.nodes){const position=geometry.get(node.id)!;nodes.push({...node,id:prefix+node.id,x:position.x!+position.width!/2,y:position.y!+position.height!/2+offset,width:position.width!,height:position.height!});}
  for(const route of result.edges??[]){const edge=method.edges[Number(route.id.slice(1))],label=route.labels?.[0];
   for(const section of route.sections??[])edges.push({...edge,from:prefix+edge.from,to:prefix+edge.to,points:[section.startPoint,...section.bendPoints??[],section.endPoint].map(point=>({x:point.x,y:point.y+offset})),...(label?{x:label.x!+label.width!/2,y:label.y!+offset+10}:{})});
  }
  const w=Math.max(result.width??0,method.name.length*7+32),h=(result.height??0)+30;
  boxes.push({name:method.name,x:0,y:top,width:w,height:h});width=Math.max(width,w);top+=h+24;
 }
 return {width,height:Math.max(0,top-24),nodes,edges,boxes};
}
