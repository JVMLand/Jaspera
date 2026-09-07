import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const bundle=await build({stdin:{contents:"export * from './src/graph-cache';export * from './src/bounded-cache';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {MethodLayoutCache,BoundedCache,cacheBudget}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('bounded cache evicts least recently used entries and rejects oversized payloads',()=>{
 const cache=new BoundedCache(10);cache.set('a',1,4);cache.set('b',2,4);assert.equal(cache.get('a'),1);cache.set('c',3,4);assert.equal(cache.get('b'),undefined);cache.set('big',4,11);assert.equal(cache.get('big'),undefined);assert.equal(cache.get('a'),1);assert.ok(cacheBudget(4)<cacheBudget(16));assert.equal(cacheBudget(),cacheBudget(4));
});
test('layout reuse rebinds node IDs, source positions and reachability; topology and filters invalidate it',()=>{
 const cache=new MethodLayoutCache();const graph={name:'run()V',nodes:[{id:'n0',text:'nop',line:1,column:2,unreachable:false},{id:'n2',text:'return',line:2,column:2}],edges:[{from:'n0',to:'n2',kind:'control',label:''}]};
 const layout={width:200,height:150,boxes:[],nodes:graph.nodes.map((n,i)=>({...n,id:'m0:'+n.id,x:20,y:30+i*50,width:110,height:30})),edges:[{...graph.edges[0],from:'m0:n0',to:'m0:n2',points:[{x:20,y:45},{x:20,y:65}]}]};cache.set(graph,layout);
 const shifted={...graph,nodes:graph.nodes.map((n,i)=>({...n,id:'new'+i,line:n.line+50,column:8,unreachable:true})),edges:[{...graph.edges[0],from:'new0',to:'new1'}]};const reused=cache.get(shifted);assert.equal(reused.nodes[0].line,51);assert.equal(reused.nodes[0].id,'m0:new0');assert.equal(reused.nodes[0].x,20);assert.equal(reused.nodes[0].unreachable,true);assert.equal(reused.edges[0].from,'m0:new0');assert.equal(cache.get({...graph,edges:[]}),undefined);assert.equal(cache.get({...graph,nodes:[{...graph.nodes[0],text:'iconst_1'},graph.nodes[1]]}),undefined);assert.equal(cache.get(graph).nodes[0].line,1);
});
