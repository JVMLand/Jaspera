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
 assert.equal(edge.points.length,narrowTarget?4:3);assert.equal(edge.points[0].x,mirrored?310:190);assert.equal(edge.points[1].x,narrowTarget?(mirrored?120:380):(mirrored?135:365));
 assert.deepEqual(edge.points.at(-1),narrowTarget?{x:mirrored?160:340,y:281}:{x:mirrored?135:365,y:270});
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
 else {assert.equal(edge.points.length,3);assert.deepEqual(edge.points[0],old[0]);const end=edge.points.at(-1);assert.equal(end.y,890);assert.ok(end.x>491.5&&end.x<494);assert.ok(edge.points.every(p=>p.x>=end.x));}
});

for(const mirrored of [false,true])test('parallel stack and control routes use separate straight lanes beside an exception '+mirrored,()=>{
 const boxes=[{id:'call',x:31,y:105,width:480,height:32},{id:'return',x:215,y:281,width:115,height:32},
  {id:'try',x:13,y:14,width:518,height:173},{id:'end',x:23,y:231,width:325,height:100},{id:'handler',x:350,y:380,width:150,height:100}];
 const control={from:'call',to:'return',label:'',points:[{x:272,y:137},{x:272,y:281}]};
 const stack={from:'call',to:'return',label:'',points:[{x:36,y:137},{x:36,y:296},{x:215,y:296}]};
 const exception={from:'try',to:'handler',label:'',points:[{x:63,y:187},{x:63,y:203},{x:373,y:203},{x:373,y:380}]};
 const edges=[control,stack,exception];
 if(mirrored){for(const box of boxes)box.x=600-box.x-box.width;for(const edge of edges)edge.points=edge.points.map(p=>({x:600-p.x,y:p.y}));}
 simplifyGraphRoutes(boxes,edges,new Map([['call','try'],['return','end']]),{x:0,y:0,width:600,height:500});
 for(const edge of edges){assert.equal(edge.points.length,2);assert.equal(edge.points[0].x,edge.points[1].x);}
 assert.ok(Math.abs(stack.points[0].x-control.points[0].x)>=4);
 assert.ok(Math.abs(stack.points[0].x-exception.points[0].x)>=4);
});

for(const alreadyShort of [false,true])test('east departures prefer the vertical center over a marginally shorter route '+alreadyShort,()=>{
 const edge={from:'s',to:'t',label:'',points:alreadyShort?[{x:120,y:46},{x:260,y:46},{x:260,y:160}]:[{x:70,y:50},{x:70,y:100},{x:260,y:100},{x:260,y:160}]};
 simplifyGraphRoutes([source,target],[edge],new Map(),bounds);
 assert.equal(edge.points.length,3);assert.deepEqual(edge.points[0],{x:120,y:35});
});
for(const obstacle of ['node','edge'])test('east departures remain offset when the center is occupied by a '+obstacle,()=>{
 const edge={from:'s',to:'t',label:'',points:[{x:120,y:46},{x:260,y:46},{x:260,y:160}]};
 const boxes=[source,target,...(obstacle==='node'?[{id:'wall',x:125,y:32,width:50,height:6}]:[])];
 const edges=[edge,...(obstacle==='edge'?[{from:'other',to:'elsewhere',label:'',points:[{x:120,y:35},{x:200,y:35}]}]:[])];
 simplifyGraphRoutes(boxes,edges,new Map(),bounds);
 assert.deepEqual(edge.points[0],{x:120,y:46});assert.equal(edge.points.length,3);
});

for(const mirrored of [false,true])for(const interlocked of [false,true])test('dup sibling routes nest without crossings and land on target sides '+mirrored+' '+interlocked,()=>{
 const boxes=[{id:'dup',x:100,y:20,width:110,height:30},{id:'wall',x:0,y:100,width:330,height:30},{id:'init',x:0,y:180,width:330,height:30},{id:'put',x:0,y:260,width:330,height:30}];
 const near={from:'dup',to:'init',label:'',points:[{x:210,y:46},{x:350,y:46},{x:350,y:160},{x:200,y:160},{x:200,y:180}]};
 const far={from:'dup',to:'put',label:'',points:[{x:210,y:35},{x:340,y:35},{x:340,y:240},{x:100,y:240},{x:100,y:260}]};
 if(interlocked){near.points=[{x:210,y:35},{x:340,y:35},{x:340,y:160},{x:200,y:160},{x:200,y:180}];far.points=[{x:210,y:46},{x:350,y:46},{x:350,y:170},{x:340,y:170},{x:340,y:240},{x:100,y:240},{x:100,y:260}];}
 if(mirrored){for(const box of boxes)box.x=500-box.x-box.width;for(const edge of [near,far])edge.points=edge.points.map(p=>({x:500-p.x,y:p.y}));}
 simplifyGraphRoutes(boxes,[near,far],new Map(),{x:0,y:0,width:500,height:350});
 for(const edge of [near,far]){assert.equal(edge.points.length,4);assert.equal(edge.points[2].y,edge.points[3].y);assert.equal(edge.points[3].x,mirrored?170:330);}
 assert.ok(far.points[0].y<near.points[0].y);
 assert.ok(mirrored?far.points[1].x<near.points[1].x:far.points[1].x>near.points[1].x);
 assert.equal(near.to,'init');assert.equal(far.to,'put');
});

for(const mirrored of [false,true])test('side-to-top connections find fresh clear lanes between occupied original lanes '+mirrored,()=>{
 const boxes=[{id:'s',x:60,y:100,width:170,height:45},{id:'middle',x:60,y:190,width:170,height:45},{id:'t',x:0,y:400,width:400,height:45}];
 const edge={from:'s',to:'t',label:'',points:[{x:173,y:145},{x:173,y:175},{x:245,y:175},{x:245,y:275},{x:262,y:275},{x:262,y:400}]};
 const occupied=[245,262,278].map((x,i)=>({from:'other'+i,to:'t',label:'',points:[{x,y:50},{x,y:400}]}));
 if(mirrored){for(const box of boxes)box.x=500-box.x-box.width;for(const e of [edge,...occupied])e.points=e.points.map(p=>({x:500-p.x,y:p.y}));}
 simplifyGraphRoutes(boxes,[edge,...occupied],new Map(),{x:0,y:0,width:500,height:500});
 assert.equal(edge.points.length,3);assert.deepEqual(edge.points[0],{x:mirrored?270:230,y:mirrored?141:122.5});assert.equal(edge.points[1].x,edge.points[2].x);assert.equal(edge.points[2].y,400);
 const lane=mirrored?500-edge.points[1].x:edge.points[1].x;assert.ok(lane>230&&lane<241);
});
