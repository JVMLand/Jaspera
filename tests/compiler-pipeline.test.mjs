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
