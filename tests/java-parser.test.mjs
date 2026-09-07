import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {delimiter} from 'node:path';
test('Java fast parser preserves LL trees and diagnostics and reports source progress',async()=>{
 const dir='.cache/parser-test';await mkdir(dir,{recursive:true});
 await writeFile(dir+'/ParserProbe.java',`package jalweb;
 import org.antlr.v4.runtime.*;import tokyo.peya.langjal.compiler.*;import java.util.*;
 public class ParserProbe {
  static CommonTokenStream tokens(String source){var lexer=new JALLexer(CharStreams.fromString(source));lexer.removeErrorListeners();var tokens=new CommonTokenStream(lexer);tokens.fill();return tokens;}
  static BaseErrorListener errors(List<String> messages){return new BaseErrorListener(){public void syntaxError(Recognizer<?,?> r,Object t,int line,int col,String message,RecognitionException e){messages.add(line+":"+col+":"+message);}};}
  public static void main(String[] args){
   for(String body:List.of("bipush 1 pop return","bipush return","bipush ? return","nop ".repeat(2000)+"return")){
    String source="public class Main {public static main()V {"+body+"}}";
    var slowErrors=new ArrayList<String>();var parser=new JALParser(tokens(source));parser.removeErrorListeners();parser.addErrorListener(errors(slowErrors));var slow=parser.root();
    var fastErrors=new ArrayList<String>();var steps=new ArrayList<Integer>();
    var stream=tokens(source);var fast=SourceParser.parse(stream,errors(fastErrors),true,(done,total)->{if(done<0||done>total)throw new AssertionError();steps.add(done);});
    if(!slow.toStringTree(parser).equals(fast.toStringTree(parser))||!slowErrors.equals(fastErrors))throw new AssertionError("different recovery: "+body);
    if(steps.get(0)!=0||steps.get(steps.size()-1)!=stream.size()-1)throw new AssertionError("missing progress");
   }
   System.out.println("OK");
  }
 }`);
 const compile=spawnSync('javac',['-cp','public/runtime/jalweb-compiler.jar','-d',dir,dir+'/ParserProbe.java'],{encoding:'utf8'});assert.equal(compile.status,0,compile.stderr);
 const run=spawnSync('java',['-cp',dir+delimiter+'public/runtime/jalweb-compiler.jar','jalweb.ParserProbe'],{encoding:'utf8',timeout:60000});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/OK/);
});
