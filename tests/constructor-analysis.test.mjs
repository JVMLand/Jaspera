import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='.cache/constructor-analysis';await mkdir(directory,{recursive:true});
async function compile(name,body){const path=directory+'/'+name+'.jal';await writeFile(path,body);const result=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar','jalweb.Bridge',path],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
const header='public class Main (major_version=67, minor_version=0, super_class=java/io/FilterOutputStream) { public value:I ';
const superCall='aload_0 aconst_null invokespecial java/io/FilterOutputStream-><init>(Ljava/io/OutputStream;)V';
const setField='iconst_1 putfield Main->value:I';
for(const [name,body] of [
 ['super',`public <init>()V { ${superCall} aload_0 ${setField} return }`],
 ['this',`public <init>()V { aload_0 iconst_1 invokespecial Main-><init>(I)V aload_0 ${setField} return } public <init>(I)V { ${superCall} return }`],
 ['aliases',`public <init>()V { aload_0 astore_1 aload_0 ${superCall} ${setField} aload_1 ${setField} return }`],
 ['separate-instance',`public <init>()V { ${superCall} new java/io/FilterOutputStream dup aconst_null invokespecial java/io/FilterOutputStream-><init>(Ljava/io/OutputStream;)V pop aload_0 ${setField} return }`],
]) test(name+' preserves the initialized receiver type',async()=>{const result=await compile(name,header+body+'}');assert.deepEqual(result.diagnostics,[]);assert.ok(result.bytecode);assert.ok(result.graphs.length);});
test('an unrelated field receiver is still rejected',async()=>{const result=await compile('wrong','public class Main (major_version=67, minor_version=0) { public static x()V { ldc "wrong" iconst_0 putfield java/io/PrintStream->trouble:Z return } }');assert.equal(result.bytecode,'');assert.match(result.diagnostics[0].message,/PrintStream.*String/);});
test('reference and array class constants round-trip through disassembly',async()=>{
 const result=await compile('constants','public class Main (major_version=67, minor_version=0) { public static x()V { ldc Ljava/lang/String; pop ldc_w [I pop ldc [[Ljava/lang/String; pop return } }');assert.deepEqual(result.diagnostics,[]);
 const probe=directory+'/Disassemble.java';await writeFile(probe,'import jalweb.Bridge; public class Disassemble { public static void main(String[] a) { System.out.print(Bridge.disassemble(a[0])); } }');
 const process=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar',probe,result.bytecode],{encoding:'utf8'});assert.equal(process.status,0,process.stderr);const source=JSON.parse(process.stdout).source;
 for(const descriptor of ['Ljava/lang/String;','[I','[[Ljava/lang/String;'])assert.ok(source.split('\n').some(line=>line.trim()==='ldc '+descriptor),descriptor);
 assert.deepEqual((await compile('roundtrip',source)).diagnostics,[]);
});
test('primitive class descriptors and category-2 class constants are rejected',async()=>{for(const instruction of ['ldc I','ldc2_w Ljava/lang/String;']){const result=await compile('invalid','public class Main (major_version=67, minor_version=0) { public static x()V { '+instruction+' pop return } }');assert.equal(result.bytecode,'');assert.ok(result.diagnostics.some(d=>d.severity==='error'));}});

test('native and abstract declarations need no return and emit no instructions',async()=>{
 const result=await compile('declarations','public abstract class Main (major_version=67, minor_version=0) { public static native clock()J {} public abstract value()I {} public static native clear()V {} public static code()I { iconst_1 ireturn } }');assert.deepEqual(result.diagnostics,[]);assert.ok(result.bytecode);assert.equal(result.graphs.length,1);
 const probe=directory+'/InspectDeclarations.java';await writeFile(probe,'import org.objectweb.asm.*; import org.objectweb.asm.tree.*; import java.util.*; public class InspectDeclarations { public static void main(String[] a) { ClassNode c=new ClassNode(); new ClassReader(Base64.getDecoder().decode(a[0])).accept(c,0); for(MethodNode m:c.methods) if((m.access & (Opcodes.ACC_NATIVE | Opcodes.ACC_ABSTRACT)) != 0 && m.instructions.size()!=0) throw new AssertionError(m.name); } }');const checked=spawnSync('java',['-cp','public/runtime/jalweb-compiler.jar',probe,result.bytecode],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr);
});
test('native and abstract declarations reject instruction bodies',async()=>{for(const modifier of ['native','abstract']){const result=await compile('invalid-declaration','public abstract class Main (major_version=67, minor_version=0) { public '+modifier+' x()I { iconst_1 ireturn } }');assert.equal(result.bytecode,'');assert.match(result.diagnostics[0].message,/cannot contain instructions/);}});
