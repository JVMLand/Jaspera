import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/frame-value.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {formatFrameValue:format}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('frame labels abbreviate types without rewriting string contents',()=>{
 for(const [input,expected] of [
  ['java/io/PrintStream @57bd940','PrintStream'],['[Ljava/lang/String; @5ad0548','String[]'],['[[I @1234','int[][]'],['"java/io/Foo @1234"','"java/io/Foo @1234"'],['java.io.PrintStream','PrintStream'],['java.lang.String[][]','String[][]'],['java.util.Map$Entry','Map$Entry'],
  ['receiver : java.io.PrintStream','receiver : PrintStream'],['value : int','value : int'],
  ['"java.io.PrintStream : String" : java.lang.String','"java.io.PrintStream : String"'],['"a:b" : String','"a:b"'],['"truncated… : java.lang.String','"truncated…'],['null','null'],['未設定','未設定']
 ])assert.equal(format(input),expected,input);
});
test('self-describing literals omit type annotations and retain numeric distinctions',()=>{
 for(const [input,expected] of [
  ['0x12: byte','0x12'],['12s: short','12s'],['123: int','123'],['1.23f: float','1.23f'],['1.23d: double','1.23d'],['123L: long','123L'],['true: boolean','true'],['false: boolean','false'],["'a': char","'a'"],["'\\n': char","'\\n'"],
  ['0 : int','0'],['-1 : int','-1'],['0 : long','0L'],['1 : float','1f'],['1.23 : double','1.23d'],['-1e-5 : float','-1e-5f'],['12 : short','12s'],['65 : char','65 : char'],['12 : byte','12 : byte'],['int','int'],['long','long']
 ])assert.equal(format(input),expected,input);
});
