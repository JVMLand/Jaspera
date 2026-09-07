import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='.cache/compiler-pipeline';await mkdir(directory,{recursive:true});
function java(args){const result=spawnSync('java',args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
async function compile(name,source){const path=directory+'/'+name+'.jal';await writeFile(path,source);return JSON.parse(java(['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge',path]));}
test('ASCII JSON escaping preserves every UTF-16 code unit',async()=>{
 const path=directory+'/QuoteProbe.java';await writeFile(path,`import jalweb.Bridge;
 public class QuoteProbe {public static void main(String[] args){StringBuilder text=new StringBuilder();for(int c=0;c<=65535;c++)text.append((char)c);System.out.print(Bridge.quote(text.toString()));}}`);
 const encoded=java(['-cp','public/runtime/jalweb-compiler.jar',path]);assert.doesNotMatch(encoded,/[^\x20-\x7e]/);
 const decoded=JSON.parse(encoded);assert.equal(decoded.length,65536);for(let c=0;c<=65535;c++)assert.equal(decoded.charCodeAt(c),c);
});
test('parsed AST retains macro expansion and instruction source locations',async()=>{
 const result=await compile('macro','#define PUSH iconst_2\npublic class Main (major_version=67, minor_version=0) {\n public static value()I {\n PUSH\n ireturn\n }\n}');
 assert.deepEqual(result.diagnostics,[]);assert.ok(result.bytecode);assert.ok(result.stackFrames.some(frame=>frame.line===4));
 assert.ok(result.graphs.some(graph=>graph.nodes.some(node=>node.opcode==='iconst_2'&&node.line===4)));
});
test('syntax and lexer errors prevent bytecode emission',async()=>{
 for(const [name,source] of [['empty',''],['syntax','public class Main { public static x()V { return }'],['lexer','public class Main { public static x()V { ` return } }']]){
  const result=await compile(name,source);assert.equal(result.bytecode,'');assert.ok(result.diagnostics.some(d=>d.severity==='error'),name);
 }
});

test('conditional branches inside a label block retain locals needed at their target',async()=>{
 const result=await compile('branch-local','public class Main (major_version=67, minor_version=0) { public static choose(I)I { iconst_4 istore_1 goto Test Test: iload_0 ifeq Done iconst_5 istore_1 goto Done Done: iload_1 ireturn } }');assert.deepEqual(result.diagnostics,[]);assert.ok(result.bytecode);
 const probe=directory+'/BranchProbe.java';await writeFile(probe,'import java.util.*; public class BranchProbe extends ClassLoader { public static void main(String[] a) throws Exception { byte[] code=Base64.getDecoder().decode(a[0]); Class<?> c=new BranchProbe().defineClass(null,code,0,code.length); var m=c.getMethod("choose",int.class); if(!m.invoke(null,0).equals(4) || !m.invoke(null,1).equals(5)) throw new AssertionError(); } }');java([probe,result.bytecode]);
});
test('a branch that reaches an uninitialized local remains invalid',async()=>{const result=await compile('missing-local','public class Main (major_version=67, minor_version=0) { public static choose(I)I { iload_0 ifeq Done iconst_5 istore_1 Done: iload_1 ireturn } }');assert.equal(result.bytecode,'');assert.ok(result.diagnostics.some(d=>d.severity==='error'));});

test('progress reports method stages and completed graphs without changing compilation results',async()=>{
 const source='public class Progress (major_version=67, minor_version=0) { public static first()V { return } public static second()I { iconst_1 ireturn } }';const probe=directory+'/ProgressProbe.java';await writeFile(probe,'import jalweb.Bridge; public class ProgressProbe { public static void main(String[] a) { System.out.println(Bridge.compileWithProgress(a[0])); } }');const output=java(['-cp','public/runtime/jalweb-compiler.jar',probe,Buffer.from(source).toString('base64')]);const lines=output.split(/\r?\n/),events=lines.filter(l=>l.startsWith('\x1eJALWEB_PROGRESS ')).map(l=>JSON.parse(l.slice(17))),result=JSON.parse(lines.at(-1));assert.deepEqual(result.diagnostics,[]);assert.ok(events.some(p=>p.phase==='analysis'&&p.method==='first()V'&&p.finished));assert.deepEqual(events.filter(p=>p.graph).map(p=>p.graph),result.graphs);assert.ok(events.some(p=>p.phase==='frames'&&p.completed<p.total));
});

test('disassembled lookupswitch puts every case and default on its own line',async()=>{
 const source='public class Main (major_version=67, minor_version=0) { public static choose(I)V { iload_0 lookupswitch { 0: L3, 92906313: L2, 271239035: L1, 1544803905: L4, default: L5 } L1: return L2: return L3: return L4: return L5: return } }';const result=await compile('lookup-lines',source);assert.deepEqual(result.diagnostics,[]);
 const probe=directory+'/LookupDisassembly.java';await writeFile(probe,'import jalweb.Bridge; public class LookupDisassembly { public static void main(String[] a) { System.out.println(Bridge.disassemble(a[0])); } }');const output=JSON.parse(java(['-cp','public/runtime/jalweb-compiler.jar',probe,result.bytecode])).source;
 assert.match(output,/    lookupswitch \{\n      0: L\d+,\n      92906313: L\d+,\n      271239035: L\d+,\n      1544803905: L\d+,\n      default: L\d+\n    \}/);assert.deepEqual((await compile('lookup-roundtrip',output)).diagnostics,[]);
});

test('selective outputs preserve bytecode and reject invalid stacks in every mode',async()=>{
 const probe=directory+'/SelectedProbe.java';await writeFile(probe,'import jalweb.Bridge; public class SelectedProbe { public static void main(String[] a) { System.out.println(Bridge.compileSelected(a[0],Integer.parseInt(a[1]))); } }');
 const compileSelected=(source,mode)=>JSON.parse(java(['-cp','public/runtime/jalweb-compiler.jar',probe,Buffer.from(source).toString('base64'),String(mode)]).split(/\r?\n/).at(-1));
 const source='public class Main (major_version=67, minor_version=0) { public static value()I { iconst_1 ireturn } }';let bytecode;
 for(let mode=0;mode<4;mode++){const result=compileSelected(source,mode);assert.deepEqual(result.diagnostics,[]);bytecode??=result.bytecode;assert.equal(result.bytecode,bytecode);assert.equal(result.stackFrames.length>0,!!(mode&1));assert.equal(result.graphs.length>0,!!(mode&2));const bad=compileSelected(source.replace('iconst_1','aconst_null'),mode);assert.equal(bad.bytecode,'');assert.ok(bad.diagnostics.some(d=>d.severity==='error'));}
});
