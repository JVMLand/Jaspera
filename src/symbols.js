import antlr4 from 'antlr4';
import JALLexer from './generated/offset-parser/JALLexer.js';
import JALParser from './generated/offset-parser/JALParser.js';
const rule=n=>JALParser.ruleNames[n?.ruleIndex];
const span=n=>({start:n.start.start,end:n.stop.stop+1});
export function analyzeSymbols(source){
 const result={classes:[],references:[]};if(source.length>1024*1024)return result;
 try{
  const lexer=new JALLexer(new antlr4.InputStream(source));lexer.removeErrorListeners();const tokens=new antlr4.CommonTokenStream(lexer);tokens.fill();
  const parser=new JALParser(tokens);parser.removeErrorListeners();const root=parser.root();
  const collect=(node,name)=>{const out=[];const walk=n=>{if(rule(n)===name){out.push(n);return;}for(const c of n.children??[])walk(c);};walk(node);return out;};
  const valid=n=>n?.start?.start>=0&&n?.stop?.stop>=n.start.start&&!n.exception;
  const add=(node,ref)=>{if(valid(node))result.references.push({...span(node),...ref});};
  for(const c of collect(root,'classDefinition')){
   const classNode=c.className();if(!valid(classNode))continue;
   const owner=classNode.getText(),superNode=collect(c,'classPropSuperClass')[0]?.className();
   const interfaces=collect(c,'classPropInterfaces').flatMap(n=>n.className().map(x=>x.getText()));
   const info={owner,...span(classNode),parents:[superNode?.getText()??(owner==='java/lang/Object'?'':'java/lang/Object'),...interfaces].filter(Boolean),members:[]};result.classes.push(info);
   for(const f of collect(c,'fieldDefinition'))if(valid(f.fieldName())&&valid(f.typeDescriptor()))info.members.push({kind:'field',static:f.accModField().accAttrField().some(a=>a.getText()==='static'),name:f.fieldName().getText(),descriptor:f.typeDescriptor().getText(),...span(f.fieldName())});
   for(const m of collect(c,'methodDefinition')){
    if(!valid(m.methodName())||!valid(m.methodDescriptor()))continue;
    info.members.push({kind:'method',hasCode:!m.accModMethod().accAttrMethod().some(a=>a.getText()==='native'||a.getText()==='abstract'),static:m.accModMethod().accAttrMethod().some(a=>a.getText()==='static'),name:m.methodName().getText(),descriptor:m.methodDescriptor().getText(),...span(m.methodName())});
    const labels=collect(m,'label');
    for(const label of collect(m,'labelName')){const name=label.getText(),targets=labels.filter(l=>l.labelName().getText()===name);if(targets.length===1)add(label,{kind:'label',owner,name,target:span(targets[0].labelName())});}
   }
   for(const ref of collect(c,'jvmInsArgFieldRef'))if(valid(ref.typeDescriptor()))add(ref.fieldName(),{kind:'field',owner:ref.fullQualifiedClassName().getText(),name:ref.fieldName().getText(),descriptor:ref.typeDescriptor().getText()});
   for(const ref of collect(c,'jvmInsArgMethodRef'))if(valid(ref.methodDescriptor()))add(ref.methodName(),{kind:'method',owner:ref.arrayTypeDescriptor()?.getText()??ref.fullQualifiedClassName()?.getText()??owner,name:ref.methodName().getText(),descriptor:ref.methodDescriptor().getText()});
   for(const ref of collect(c,'fullQualifiedClassName'))if(ref.start.start!==classNode.start.start)add(ref,{kind:'class',owner:ref.getText()});
  }
  // Object types may be embedded in a single METHOD_DESCRIPTOR lexer token.
  for(const token of tokens.tokens)if(token.channel===0&&(token.type===JALLexer.METHOD_DESCRIPTOR||token.type===JALLexer.TYPE_DESC_OBJECT)){
   for(const match of token.text.matchAll(/L([\w$/]+);/g))result.references.push({kind:'class',owner:match[1],start:token.start+match.index+1,end:token.start+match.index+1+match[1].length});
  }
 }catch{/* Incomplete source may have only a partial index. */}
 return result;
}
