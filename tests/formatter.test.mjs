import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b=await build({entryPoints:['src/formatter.js'],bundle:true,write:false,format:'esm',platform:'browser'});
const {formatJal}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
test('formats declarations and instructions; labels align with method declarations',()=>{
 const input='public class Main { public static calc(I)I { iload_0 ifeq Zero iconst_1 ireturn Zero: iconst_0 ireturn } }';
 const expected='public class Main {\n  public static calc(I)I {\n    iload_0\n    ifeq Zero\n    iconst_1\n    ireturn\n  Zero:\n    iconst_0\n    ireturn\n  }\n}\n';assert.equal(formatJal(input),expected);assert.equal(formatJal(expected),expected);
});
test('preserves literal and comment contents, uses editor tabs and CRLF',()=>{
 const source='public class Main {\r\npublic static main([Ljava/lang/String;)V {\r\n// braces { } stay in the comment\r\nldc "a  b { } // :"\r\npop\r\nreturn\r\n}\r\n}';
 const formatted=formatJal(source,{insertSpaces:false,tabSize:4});assert.match(formatted,/\r\n\tpublic/);assert.match(formatted,/\r\n\t\tldc "a  b { } \/\/ :"/);assert.ok(formatted.includes('// braces { } stay in the comment'));assert.equal(formatJal(formatted,{insertSpaces:false}),formatted);
});
test('switch cases are deeper than instructions, not outdented like jump labels',()=>{
 const source='public class Main { public static calc(I)V { iload_0 lookupswitch { 1: One, default: Done } One: nop Done: return } }';
 const result=formatJal(source);assert.match(result,/\n      1:One,\n      default:Done\n    }/);assert.match(result,/\n  One:\n    nop\n  Done:/);assert.equal(formatJal(result),result);
});
test('preprocessor continuations and block comments are opaque',()=>{
 const source='#define BODY \\\n  ldc "macro  text" \\\n  pop\npublic class Main {\npublic static main([Ljava/lang/String;)V {\n/* keep\n  comment { layout }\n*/\nBODY\nreturn\n}\n}';
 const formatted=formatJal(source);assert.ok(formatted.startsWith(source.slice(0,source.indexOf('public'))));assert.ok(formatted.includes('/* keep\n  comment { layout }\n*/'));assert.equal(formatJal(formatted),formatted);
});

test('hash signs inside multiline literals and comments are preserved',()=>{
 const source='public class Main { public static main([Ljava/lang/String;)V { ldc "line\n#define LITERAL  42\nend" pop /* line\n#define COMMENT  2\nend */ return } }';
 const output=formatJal(source);assert.ok(output.includes('"line\n#define LITERAL  42\nend"'));assert.ok(output.includes('/* line\n#define COMMENT  2\nend */'));assert.equal(formatJal(output),output);
});

test('all bundled examples format idempotently without changing non-whitespace content',async()=>{
 const opaque=source=>source.match(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|\S/g);
 for(const name of await readdir('src/examples')){const source=await readFile('src/examples/'+name,'utf8'),formatted=formatJal(source);assert.deepEqual(opaque(formatted),opaque(source),name);assert.equal(formatJal(formatted),formatted,name);}
});
