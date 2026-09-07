import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import ELK from 'elkjs/lib/elk.bundled.js';
await build({entryPoints:['src/graph-layout.ts'],outfile:'.cache/graph-layout.mjs',bundle:true,platform:'node',format:'esm'});
const {positionGraphs}=await import('../.cache/graph-layout.mjs');const elk=new ELK();
const node=id=>({id,text:id,opcode:'nop',block:'B0',line:1,column:1,consumed:0,produced:0,unreachable:false});
const edge=(from,to,kind='control')=>({from,to,kind,label:''});
test('simple chains stay straight; methods retain separate namespaces and bounds',async()=>{const method={name:'sample()V',nodes:['a','b','c'].map(node),edges:[edge('a','b'),edge('b','c')]};const result=await positionGraphs([method,{...method,name:'other()V'}],elk);assert.equal(result.nodes.length,6);assert.equal(new Set(result.nodes.map(n=>n.id)).size,6);assert.ok(result.boxes[1].y>result.boxes[0].height);for(const e of result.edges){assert.equal(e.points.length,2);assert.equal(e.points[0].x,e.points[1].x);}});
test('joins, loops and parallel data/control edges use only orthogonal segments',async()=>{const method={name:'loop()V',nodes:['a','b','c','d'].map(node),edges:[edge('a','b'),edge('a','b','stack'),edge('a','c'),edge('b','d'),edge('c','d'),edge('d','a'),edge('b','b','local')]};const result=await positionGraphs([method],elk);assert.equal(result.edges.length,method.edges.length);for(const e of result.edges){assert.ok(e.points.length>=2);for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i];assert.ok(Math.abs(a.x-b.x)<.001||Math.abs(a.y-b.y)<.001);}}});

const arithmetic={name:'main([Ljava/lang/String;)V',nodes:[
 ['out','getstatic java/lang/System->out:Ljava/io/PrintStream;'],['seven','bipush 7'],['five','iconst_5'],['add','iadd'],['three','iconst_3'],['multiply','imul'],['print','invokevirtual java/io/PrintStream->println(I)V'],['return','return']
].map(([id,text])=>({...node(id),text})),edges:[
 ...['out','seven','five','add','three','multiply','print'].map((id,i)=>edge(id,['seven','five','add','three','multiply','print','return'][i])),
 edge('out','print','stack'),edge('seven','add','stack'),edge('five','add','stack'),edge('add','multiply','stack'),edge('three','multiply','stack'),edge('multiply','print','stack')
]};
test('arithmetic dependencies slide their endpoints into clear straight corridors',async()=>{
 const result=await positionGraphs([arithmetic],elk);
 for(const e of result.edges){assert.equal(e.points.length,2,JSON.stringify(e));assert.equal(e.points[0].x,e.points[1].x);}
 for(const e of result.edges){
  const [a,b]=e.points;
  for(const n of result.nodes){if(n.id===e.from||n.id===e.to)continue;
   assert.ok(!(a.x>n.x-n.width/2&&a.x<n.x+n.width/2&&Math.min(a.y,b.y)<n.y+n.height/2&&Math.max(a.y,b.y)>n.y-n.height/2),'edge crosses '+n.id);
  }
 }
});

test('blocked corridors retain ELK detours and clear horizontal corridors use side ports',async()=>{
 const fixture=async(blocked)=>{
  const graph={id:'method',children:[{id:'a',x:0,y:0,width:110,height:30},{id:'b',x:160,y:10,width:110,height:30},...(blocked?[{id:'wall',x:130,y:0,width:20,height:60}]:[])],edges:[{id:'e0',sources:['a'],targets:['b'],sections:[{id:'s',startPoint:{x:55,y:30},bendPoints:[{x:55,y:70},{x:215,y:70}],endPoint:{x:215,y:40}}]}],width:300,height:100};
  const method={name:'side()V',nodes:graph.children.map(n=>node(n.id)),edges:[edge('a','b')]};
  return positionGraphs([method],{layout:async()=>graph});
 };
 const clear=await fixture(false),blocked=await fixture(true);
 assert.equal(clear.edges[0].points.length,2);assert.equal(clear.edges[0].points[0].y,clear.edges[0].points[1].y);
 assert.equal(clear.edges[0].points[0].x,110);assert.equal(clear.edges[0].points[1].x,160);
 assert.equal(blocked.edges[0].points.length,4);
});
