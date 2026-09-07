import antlr4 from 'antlr4';
import JALLexer from './generated/offset-parser/JALLexer.js';
import JALParser from './generated/offset-parser/JALParser.js';

// A snapshot is shared only for one analysis request, never retained across edits.
export function parseJal(source,fast=true){
 const lexer=new JALLexer(new antlr4.InputStream(source));lexer.removeErrorListeners();
 const stream=new antlr4.CommonTokenStream(lexer);stream.fill();
 const errors=stream.tokens.filter(t=>t.type===JALLexer.ERRCHAR).map(t=>t.tokenIndex);
 // Try context-free prediction first; incomplete/ambiguous input falls back to
 // the original LL parser and its error recovery using the same lexer tokens.
 if(fast&&errors.length===0){
  const quick=new JALParser(stream);quick.removeErrorListeners();
  quick._interp.predictionMode=antlr4.atn.PredictionMode.SLL;
  quick._errHandler=new antlr4.error.BailErrorStrategy();
  try{return {stream,errors,root:quick.root()};}
  catch{/* BailErrorStrategy aborted; retry with full context and recovery. */}
  stream.seek(0);
 }
 const parser=new JALParser(stream);parser.removeErrorListeners();
 parser.addErrorListener({syntaxError:(_r,t)=>{if(t)errors.push(t.tokenIndex);},reportAmbiguity(){},reportAttemptingFullContext(){},reportContextSensitivity(){}});
 return {stream,errors,root:parser.root()};
}
