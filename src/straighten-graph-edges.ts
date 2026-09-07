import type {ElkNode,ElkPoint} from 'elkjs/lib/elk-api';

type Axis='x'|'y';
interface Interval {start:number;end:number}
const clearance=4,edgeSpacing=8;
const overlaps=(a:Interval,b:Interval)=>a.start<b.end&&b.start<a.end;
const span=(node:ElkNode,axis:Axis):Interval=>({start:node[axis]!,end:node[axis]!+(axis==='x'?node.width!:node.height!)});
function exclude(intervals:Interval[],blocked:Interval){
 return intervals.flatMap(part=>!overlaps(part,blocked)?[part]:[
  ...(part.start<blocked.start?[{start:part.start,end:blocked.start}]:[]),
  ...(blocked.end<part.end?[{start:blocked.end,end:part.end}]:[])
 ]);
}

/** Keep ELK's placement and obstacle routing, but allow attachment points to slide
 * along node borders when the entire edge can instead be a straight segment. */
export function straightenGraphEdges(graph:ElkNode){
 const nodes=graph.children??[],edges=graph.edges??[],byId=new Map(nodes.map(node=>[node.id,node]));
 for(const edge of edges){
  // Labeled edges keep ELK's label placement and self loops keep their routing.
  if(edge.labels?.length||edge.sections?.length!==1||edge.sources[0]===edge.targets[0])continue;
  const source=byId.get(edge.sources[0]),target=byId.get(edge.targets[0]);if(!source||!target)continue;
  const section=edge.sections[0];
  for(const axis of ['y','x'] as const){
   const across:Axis=axis==='y'?'x':'y',a=span(source,axis),b=span(target,axis);
   const forward=a.end<b.start,backward=b.end<a.start;if(!forward&&!backward||axis==='y'&&backward)continue;
   const start=forward?a.end:a.start,end=forward?b.start:b.end,travel={start:Math.min(start,end),end:Math.max(start,end)};
   const sa=span(source,across),sb=span(target,across);
   let available:Interval[]=[{start:Math.max(sa.start,sb.start)+clearance,end:Math.min(sa.end,sb.end)-clearance}];
   if(available[0].end<available[0].start)continue;
   for(const obstacle of nodes){
    if(obstacle===source||obstacle===target||!overlaps(span(obstacle,axis),travel))continue;
    const block=span(obstacle,across);available=exclude(available,{start:block.start-clearance,end:block.end+clearance});
   }
   // Preserve separate arrows for parallel edges. Also avoid running on top of
   // any existing parallel route; crossing a perpendicular route is allowed.
   for(const other of edges){
    if(other===edge)continue;
    for(const route of other.sections??[]){
     const points=[route.startPoint,...route.bendPoints??[],route.endPoint];
     for(let i=1;i<points.length;i++){
      const p=points[i-1],q=points[i];if(Math.abs(p[across]-q[across])>.001)continue;
      if(!overlaps(travel,{start:Math.min(p[axis],q[axis]),end:Math.max(p[axis],q[axis])}))continue;
      available=exclude(available,{start:p[across]-edgeSpacing,end:p[across]+edgeSpacing});
     }
    }
   }
   if(!available.length)continue;
   const preferred=(section.startPoint[across]+section.endPoint[across])/2;
   const coordinate=available.map(part=>Math.max(part.start,Math.min(preferred,part.end))).sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred))[0];
   const point=(value:number):ElkPoint=>axis==='y'?{x:coordinate,y:value}:{x:value,y:coordinate};
   section.startPoint=point(start);section.endPoint=point(end);section.bendPoints=[];break;
  }
 }
}
