interface Point {x:number;y:number}
interface Box {id:string;x:number;y:number;width:number;height:number}
interface Route {from:string;to:string;points:Point[];label:string;x?:number;y?:number}
const epsilon=.01,gap=4;
const length=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
function hits(a:Point,b:Point,box:Box){
 return Math.abs(a.x-b.x)<epsilon?a.x>box.x-epsilon&&a.x<box.x+box.width+epsilon&&Math.max(a.y,b.y)>box.y+epsilon&&Math.min(a.y,b.y)<box.y+box.height-epsilon
 :a.y>box.y-epsilon&&a.y<box.y+box.height+epsilon&&Math.max(a.x,b.x)>box.x+epsilon&&Math.min(a.x,b.x)<box.x+box.width-epsilon;
}
function clean(points:Point[]){const out:Point[]=[];for(const point of points){if(out.length&&length(out.at(-1)!,point)<epsilon)continue;out.push(point);while(out.length>2){const a=out.at(-3)!,b=out.at(-2)!,c=out.at(-1)!;if((Math.abs(a.x-b.x)<epsilon&&Math.abs(b.x-c.x)<epsilon||Math.abs(a.y-b.y)<epsilon&&Math.abs(b.y-c.y)<epsilon)&&length(a,c)>=length(a,b)+length(b,c)-epsilon)out.splice(out.length-2,1);else break;}}return out;}

/** Keep the downward ELK placement; only replace a route with fewer elbows.
 * Loop edges keep their return path, but can leave the source from a side. */
export function simplifyGraphRoutes(boxes:Box[],edges:Route[],parents:Map<string,string>,bounds:{x:number;y:number;width:number;height:number}){
 const byId=new Map(boxes.map(box=>[box.id,box]));
 for(const edge of edges){
  if(edge.points.length<3||edge.from===edge.to)continue;
  const source=byId.get(edge.from),target=byId.get(edge.to);if(!source||!target)continue;
  const old=edge.points,first=old[0],north=Math.abs(first.y-source.y)<epsilon;
  const candidates:Point[][]=[];
  const sx=source.x+source.width/2,sy=source.y+source.height/2,tx=target.x+target.width/2,ty=target.y+target.height/2,bottom=source.y+source.height;
  if(target.y>=source.y){
   const left=Math.max(source.x,target.x)+gap,right=Math.min(source.x+source.width,target.x+target.width)-gap;
   if(left<=right&&target.y>=bottom)candidates.push([{x:(left+right)/2,y:bottom},{x:(left+right)/2,y:target.y}]);
   for(const y of [sy,bottom-gap])for(const x of [tx,Math.max(target.x+gap,Math.min(old.at(-1)!.x,target.x+target.width-gap))]){
    if(y<=target.y&&(x>source.x+source.width||x<source.x))candidates.push([{x:x>sx?source.x+source.width:source.x,y},{x,y},{x,y:target.y}]);
   }
   for(const x of [sx,source.x+gap,source.x+source.width-gap])if(ty>=bottom&&(x<target.x||x>target.x+target.width))candidates.push([{x,y:bottom},{x,y:ty},{x:x<tx?target.x:target.x+target.width,y:ty}]);
  }
  // Reuse the existing obstacle-avoiding return lane for upward/back edges.
  if(target.y<source.y)for(let i=1;i<old.length-1;i++){const point=old[i];if(point.x>source.x+source.width||point.x<source.x)candidates.push([{x:point.x>sx?source.x+source.width:source.x,y:sy},{x:point.x,y:sy},...old.slice(i)]);}
  const otherLabels=edges.filter(e=>e!==edge&&e.label&&e.x!==undefined).map(e=>({id:'',x:e.x!-Math.max(...e.label.split('\n').map(line=>line.length*6))/2,y:e.y!-10,width:Math.max(...e.label.split('\n').map(line=>line.length*6)),height:e.label.split('\n').length*14}));
  const obstacles=boxes.filter(box=>box.id!==edge.from&&box.id!==edge.to&&box.id!==parents.get(edge.from)&&box.id!==parents.get(edge.to)).concat(otherLabels);
  const viable=candidates.map(clean).filter(points=>points.length<old.length||north&&points.length===old.length).sort((a,b)=>a.length-b.length||Number(Math.abs(a.at(-1)!.y-target.y)>epsilon)-Number(Math.abs(b.at(-1)!.y-target.y)>epsilon)||a.reduce((sum,p,i)=>sum+(i?length(a[i-1],p):0),0)-b.reduce((sum,p,i)=>sum+(i?length(b[i-1],p):0),0));
  for(const points of viable){
   if(points.some(p=>p.x<bounds.x||p.x>bounds.x+bounds.width||p.y<bounds.y||p.y>bounds.y+bounds.height))continue;
   if(points.slice(1).some((p,i)=>obstacles.some(box=>hits(points[i],p,box))))continue;
   // Preserve distinct parallel arrows, including their attachment points.
   if(edges.some(other=>other!==edge&&points.slice(1).some((p,i)=>other.points.slice(1).some((q,j)=>{const a=points[i],b=other.points[j];return Math.abs(a.x-p.x)<epsilon&&Math.abs(b.x-q.x)<epsilon&&Math.abs(a.x-b.x)<gap&&Math.min(Math.max(a.y,p.y),Math.max(b.y,q.y))-Math.max(Math.min(a.y,p.y),Math.min(b.y,q.y))>epsilon||Math.abs(a.y-p.y)<epsilon&&Math.abs(b.y-q.y)<epsilon&&Math.abs(a.y-b.y)<gap&&Math.min(Math.max(a.x,p.x),Math.max(b.x,q.x))-Math.max(Math.min(a.x,p.x),Math.min(b.x,q.x))>epsilon;}))))continue;
   let label:Box|undefined;
   if(edge.label){
    const lines=edge.label.split('\n'),width=Math.max(...lines.map(line=>line.length*6)),height=lines.length*14;
    for(let i=1;i<points.length&&!label;i++){
     const a=points[i-1],b=points[i],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
     const positions=Math.abs(a.x-b.x)<epsilon?[{x:cx+8,y:cy-height/2},{x:cx-width-8,y:cy-height/2}]:[{x:cx-width/2,y:cy-height-8},{x:cx-width/2,y:cy+8}];
     for(const p of positions){const rect={...p,id:'',width,height};if(rect.x>=bounds.x&&rect.y>=bounds.y&&rect.x+width<=bounds.x+bounds.width&&rect.y+height<=bounds.y+bounds.height&&!boxes.some(box=>overlaps(rect,box))&&!otherLabels.some(box=>overlaps(rect,box))&&!edges.some(other=>other!==edge&&other.points.slice(1).some((p,i)=>hits(other.points[i],p,rect)))){label=rect;break;}}
    }
    if(!label)continue;
   }
   edge.points=points;if(label){edge.x=label.x+label.width/2;edge.y=label.y+10;}break;
  }
 }
}
