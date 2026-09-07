import {parseJal} from './jal-parse.js';
import JALLexer from './generated/offset-parser/JALLexer.js';
import JALParser from './generated/offset-parser/JALParser.js';

// Original tokens preserve editor positions; call sites, comments and macros are not declarations.
export function parameterSlots(source,parse=parseJal){
 if(source.length>1024*1024)return [];
 const result=[];
 try{
  const {stream,errors,root}=parse(source);
  const visit=node=>{
   if(JALParser.ruleNames[node.ruleIndex]!=='methodDefinition'){for(const child of node.children??[])visit(child);return;}
   const token=node.methodDescriptor()?.start,name=node.methodName()?.start;
   if(!token||token.type!==JALLexer.METHOD_DESCRIPTOR||token.tokenIndex<0||!name||name.tokenIndex<0||errors.some(i=>i>=node.start.tokenIndex&&i<=token.tokenIndex))return;
   const descriptor=token.text,end=descriptor.indexOf(')');
   let slot=stream.tokens.slice(node.start.tokenIndex,name.tokenIndex).some(t=>t.channel===0&&t.text==='static')?0:1;
   const pending=[];
   for(let offset=1;offset<end;){
    const type=descriptor.slice(offset,end).match(/^\[*(?:[ZBCSIJFD]|L[^;]+;)/)?.[0];if(!type)return;
    const width=type==='J'||type==='D'?2:1;
    pending.push({offset:token.start+offset,slot,width});slot+=width;offset+=type.length;
   }
   result.push(...pending);
  };
  visit(root);
 }catch{/* Incomplete declarations have no hints until their descriptor is valid. */}
 return result;
}
