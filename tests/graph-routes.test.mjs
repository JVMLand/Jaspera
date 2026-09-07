import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
await build({entryPoints:['src/simplify-graph-routes.ts'],outfile:'.cache/graph-routes.mjs',bundle:true,platform:'node',format:'esm'});const {simplifyGraphRoutes}=await import('../.cache/graph-routes.mjs');
const source={id:'s',x:20,y:20,width:100,height:30},target={id:'t',x:240,y:160,width:100,height:30},bounds={x:0,y:0,width:500,height:350};
const route=()=>({from:'s',to:'t',label:'FirstException\nSecondException',x:360,y:90,points:[{x:70,y:50},{x:70,y:100},{x:290,y:100},{x:290,y:160}]});
for(const mirrored of [false,true])test('downward diagonal edges use '+(mirrored?'west':'east')+' with one elbow',()=>{
 const mirror=b=>({...b,x:500-b.x-b.width}),boxes=mirrored?[mirror(source),mirror(target)]:[source,target],edge=route();if(mirrored)edge.points=edge.points.map(p=>({x:500-p.x,y:p.y}));
 simplifyGraphRoutes(boxes,[edge],new Map(),bounds);assert.equal(edge.points.length,3);assert.equal(edge.points[0].x,mirrored?boxes[0].x:source.x+source.width);assert.equal(edge.label,'FirstException\nSecondException');assert.ok(Number.isFinite(edge.x)&&Number.isFinite(edge.y));
 for(let i=1;i<edge.points.length;i++){assert.ok(edge.points[i].y>=edge.points[i-1].y);assert.ok(edge.points[i].x===edge.points[i-1].x||edge.points[i].y===edge.points[i-1].y);}
});
test('south wins when lateral shortcuts cross an obstacle',()=>{
 const edge={...route(),label:''};simplifyGraphRoutes([source,target,{id:'wall',x:125,y:10,width:200,height:60}],[edge],new Map(),bounds);assert.equal(edge.points.length,3);assert.equal(edge.points[0].y,source.y+source.height);assert.equal(edge.points[1].x,edge.points[0].x);
});
test('occupied shortcuts retain the existing detour and parallel arrows remain distinct',()=>{
 const edge=route(),old=structuredClone(edge);simplifyGraphRoutes([source,target,{id:'wall',x:125,y:0,width:100,height:210}],[edge],new Map(),bounds);assert.deepEqual(edge,old);
 const a={...route(),label:''},b={...route(),label:''};simplifyGraphRoutes([source,target],[a,b],new Map(),bounds);assert.notDeepEqual(a.points,b.points);
});
test('block exception routes use block sides without crossing contained nodes',()=>{
 const boxes=[{...source,id:'B0',width:140,height:80},{...target,id:'B1',width:140,height:80},{id:'a',x:40,y:40,width:100,height:30},{id:'b',x:260,y:180,width:100,height:30}];
 const edge={from:'B0',to:'B1',label:'Exception',points:[{x:90,y:100},{x:90,y:130},{x:310,y:130},{x:310,y:160}]};simplifyGraphRoutes(boxes,[edge],new Map([['a','B0'],['b','B1']]),bounds);assert.equal(edge.points.length,3);assert.equal(edge.points[0].x,160);
});

test('loop return lanes can leave sideways without reversing the forward layout',()=>{
 const s={...source,y:180},t={...source,id:'t'},edge={from:'s',to:'t',label:'',points:[{x:70,y:180},{x:70,y:150},{x:180,y:150},{x:180,y:0},{x:70,y:0},{x:70,y:20}]};
 simplifyGraphRoutes([s,t],[edge],new Map(),bounds);assert.ok(edge.points.length<6);assert.equal(edge.points[0].x,s.x+s.width);assert.equal(edge.points[0].y,195);assert.deepEqual(edge.points.at(-1),{x:70,y:20});assert.equal(s.y,180);assert.equal(t.y,20);
});

for(const mirrored of [false,true])for(const narrowTarget of [false,true])test('aload uses the outer lane with a movable landing point '+mirrored+' '+narrowTarget,()=>{
 const boxes=[{id:'s',x:100,y:10,width:90,height:25},{id:'t',x:0,y:270,width:narrowTarget?340:400,height:30},{id:'new',x:0,y:65,width:330,height:30},{id:'dup',x:55,y:125,width:90,height:30},{id:'iconst',x:20,y:170,width:60,height:30},{id:'init',x:0,y:215,width:330,height:30}];
 const old=[{x:150,y:35},{x:150,y:45},{x:380,y:45},{x:380,y:260},{x:300,y:260},{x:300,y:270}],edge={from:'s',to:'t',label:'',points:structuredClone(old)};
 // A second lane prevents landing at the narrow target's rightmost edge.
 const occupied={from:'other',to:'t',label:'',points:[{x:336,y:50},{x:336,y:270}]};
 if(mirrored){for(const box of boxes)box.x=500-box.x-box.width;for(const e of [edge,occupied])e.points=e.points.map(p=>({x:500-p.x,y:p.y}));}
 const end={...edge.points.at(-1)};simplifyGraphRoutes(boxes,narrowTarget?[edge,occupied]:[edge],new Map(),bounds);
 assert.equal(edge.points.length,narrowTarget?5:3);assert.equal(edge.points[0].x,mirrored?310:190);assert.equal(edge.points[1].x,mirrored?120:380);
 assert.deepEqual(edge.points.at(-1),narrowTarget?end:{x:mirrored?120:380,y:270});
 for(let i=1;i<edge.points.length;i++)assert.ok(edge.points[i].y>=edge.points[i-1].y);
});

for(const blocked of [false,true])test('inter-block stack routes remove intermediate backtracking unless blocked '+blocked,()=>{
 const boxes=[{id:'s',x:649.5,y:426,width:136,height:30},{id:'t',x:42,y:890,width:460,height:30},
  {id:'B1',x:479.5,y:338,width:453.5,height:206},{id:'B2',x:34,y:586,width:453.5,height:166},{id:'B3',x:24,y:802,width:496,height:186},
  {id:'goto',x:662.5,y:476,width:110,height:30},
  ...(blocked?[{id:'wall',x:130,y:805,width:420,height:20}]:[])];
 const edge={from:'s',to:'t',label:'',points:[{x:649.5,y:452},{x:508.5,y:452},{x:508.5,y:777},{x:92,y:777},{x:92,y:840},{x:370.57,y:840},{x:370.57,y:890}]};
 const old=structuredClone(edge.points);
 const occupied={from:'other',to:'t',label:'',points:[{x:498,y:402},{x:498,y:890}]};
 const control={from:'goto',to:'t',label:'',points:[{x:666.5,y:506},{x:666.5,y:905},{x:502,y:905}]};
 simplifyGraphRoutes(boxes,[edge,occupied,control],new Map([['s','B1'],['t','B3']]),{x:0,y:0,width:957,height:1012});
 if(blocked)assert.deepEqual(edge.points,old);
 else {assert.equal(edge.points.length,5);assert.deepEqual(edge.points[0],old[0]);assert.deepEqual(edge.points.at(-1),old.at(-1));assert.ok(edge.points.every(p=>p.x>=370.57));}
});
