import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';
const source=`public class Main (major_version=67, minor_version=0) {
 public static merge(I)I {
  iload_0
  ifeq Else
  iconst_1
  goto Join
 Else:
  iconst_2
 Join:
  istore_1
  iload_1
  iconst_3
  iadd
  ireturn
 }
 public static loop()I {
  iconst_0
  istore_0
 Loop:
  iinc 0 1
  iload_0
  bipush 10
  if_icmplt Loop
  iload_0
  ireturn
 }
 public static copies()I {
  iconst_1
  dup
  iadd
  ireturn
 }
}`;
await mkdir('.cache/graph',{recursive:true});await writeFile('.cache/graph/Main.jal',source);
const run=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge','.cache/graph/Main.jal'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);const result=JSON.parse(run.stdout);assert.ok(result.bytecode,JSON.stringify(result.diagnostics));
const method=name=>result.graphs.find(g=>g.name.startsWith(name+'('));
const node=(g,op)=>g.nodes.find(n=>n.opcode===op);
const inputs=(g,to,kind)=>g.edges.filter(e=>e.to===to.id&&e.kind===kind).map(e=>g.nodes.find(n=>n.id===e.from).opcode).sort();
test('merge retains both possible producers and distinguishes stack and local edges',()=>{const g=method('merge');assert.deepEqual(inputs(g,node(g,'istore_1'),'stack'),['iconst_1','iconst_2']);assert.deepEqual(inputs(g,node(g,'iload_1'),'local'),['istore_1']);assert.deepEqual(inputs(g,node(g,'iadd'),'stack'),['iconst_3','iload_1']);assert.equal(node(g,'iadd').consumed,2);assert.equal(node(g,'iadd').produced,1);assert.equal(node(g,'iadd').line,13);const branch=g.edges.filter(e=>e.from===node(g,'ifeq').id&&e.kind==='control');assert.deepEqual(branch.map(e=>e.label).sort(),['false','true']);assert.equal(new Set(g.nodes.map(n=>n.block)).size,4);});
test('loops retain back edges and local dependencies on previous iterations',()=>{const g=method('loop');assert.deepEqual(inputs(g,node(g,'iinc'),'local'),['iinc','istore_0']);assert.ok(g.edges.some(e=>e.from===node(g,'if_icmplt').id&&e.to===node(g,'iinc').id&&e.kind==='control'));});
test('dup becomes the immediate producer rather than skipping stack transformations',()=>{const g=method('copies');assert.deepEqual(inputs(g,node(g,'dup'),'stack'),['iconst_1']);assert.deepEqual(inputs(g,node(g,'iadd'),'stack'),['dup']);for(const g of result.graphs)for(const e of g.edges){assert.ok(g.nodes.some(n=>n.id===e.from));assert.ok(g.nodes.some(n=>n.id===e.to));}});


test('switches, handlers and legacy subroutine returns keep their control destinations',async()=>{
 const source=`public class Paths (major_version=49, minor_version=0) {
 public static choose(I)I {
 Start: [~Zero, java/lang/RuntimeException: Handler]
  iload_0
  lookupswitch { 0: Zero, 1: One, default: Other }
 Zero:
  iconst_0
  ireturn
 One:
  iconst_1
  ireturn
 Other:
  iconst_m1
  ireturn
 Handler:
  pop
  iconst_2
  ireturn
 }
 public static legacy()V {
  jsr Cleanup
  return
 Cleanup:
  astore_0
  ret 0
 }
}`;
 await writeFile('.cache/graph/Paths.jal',source);const run=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge','.cache/graph/Paths.jal'],{encoding:'utf8'});const c=JSON.parse(run.stdout);assert.ok(c.bytecode,JSON.stringify(c.diagnostics));const g=c.graphs[0];assert.deepEqual(g.edges.filter(e=>e.from===node(g,'lookupswitch').id&&e.kind==='control').map(e=>e.label).sort(),['0','1','default']);assert.ok(g.edges.some(e=>e.kind==='exception'&&e.to===node(g,'pop').block&&e.label==='RuntimeException'));assert.equal(g.edges.filter(e=>e.kind==='exception').length,1);assert.equal(g.edges.find(e=>e.kind==='exception').from,node(g,'iload_0').block);const legacy=c.graphs[1];assert.ok(legacy.edges.some(e=>e.kind==='control'&&e.from===node(legacy,'ret').id&&e.to===node(legacy,'return').id));
});

test('unused source labels split groups but debug line labels do not',async()=>{
 const source='public class Grouped { public static main()V { nop nop Unused: nop nop return } }';await writeFile('.cache/graph/Grouped.jal',source);
 const run=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge','.cache/graph/Grouped.jal'],{encoding:'utf8'});const result=JSON.parse(run.stdout);assert.ok(result.bytecode,JSON.stringify(result.diagnostics));const nodes=result.graphs[0].nodes;
 assert.equal(nodes[0].block,nodes[1].block);assert.notEqual(nodes[1].block,nodes[2].block);assert.equal(nodes[2].block,nodes[4].block);
});

test('exception types sharing a block pair become one edge with separate lines',async()=>{
 const source='public class MultiCatch { public static main()V { Start: [~End, java/lang/IllegalArgumentException: Handler, java/lang/ArithmeticException: Handler] nop nop End: return Handler: pop return } }';await writeFile('.cache/graph/MultiCatch.jal',source);
 const run=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge','.cache/graph/MultiCatch.jal'],{encoding:'utf8'});const result=JSON.parse(run.stdout);assert.ok(result.bytecode,JSON.stringify(result.diagnostics));const graph=result.graphs[0],edges=graph.edges.filter(e=>e.kind==='exception');
 assert.equal(edges.length,1);assert.equal(edges[0].label,'IllegalArgumentException\nArithmeticException');assert.equal(edges[0].from,graph.nodes[0].block);assert.equal(edges[0].to,graph.nodes.find(n=>n.opcode==='pop').block);
});
