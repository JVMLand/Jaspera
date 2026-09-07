import antlr4 from 'antlr4';
import JALLexer from './generated/offset-parser/JALLexer.js';
import JALParser from './generated/offset-parser/JALParser.js';

// Inspect original parser tokens, never expanded macros or recovered instructions.
// Token edits keep labels, whitespace and comments intact.
const integer=text=>{
 if(!/^-?(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(text??''))return undefined;
 const value=text.startsWith('-')?-Number(text.slice(1)):Number(text);
 return Number.isSafeInteger(value)&&value>=-2147483648&&value<=2147483647?value:undefined;
};
export function inspectSource(source){
 if(source.length>1024*1024)return [];
 const result=[];
 try{
  const lexer=new JALLexer(new antlr4.InputStream(source));lexer.removeErrorListeners();
  const stream=new antlr4.CommonTokenStream(lexer);stream.fill();
  const errors=stream.tokens.filter(t=>t.type===JALLexer.ERRCHAR).map(t=>t.tokenIndex);
  const parser=new JALParser(stream);parser.removeErrorListeners();parser.addErrorListener({syntaxError:(_r,t)=>{if(t)errors.push(t.tokenIndex);},reportAmbiguity(){},reportAttemptingFullContext(){},reportContextSensitivity(){}});
  const root=parser.root();
  const collect=(node,rules)=>{const out=[];const visit=n=>{if(rules.includes(JALParser.ruleNames[n.ruleIndex])){out.push(n);return;}for(const c of n.children??[])visit(c);};visit(node);return out;};
  for(const method of collect(root,['methodDefinition'])){
   const bad=Math.min(...errors.filter(i=>i>=method.start.tokenIndex&&i<=(method.stop?.tokenIndex??Infinity)));
   const descriptor=method.methodDescriptor()?.getText()??'',returnType=descriptor.slice(descriptor.lastIndexOf(')')+1);
   const expected=/^[ZBCSI]$/.test(returnType)?'ireturn':({V:'return',J:'lreturn',F:'freturn',D:'dreturn'}[returnType]??(/^[L[]/.test(returnType)?'areturn':undefined));
   let terminated;
   for(const node of collect(method,['instruction','label'])){
    if(JALParser.ruleNames[node.ruleIndex]==='label'){terminated=undefined;continue;}
    const from=node.start.tokenIndex,to=node.stop?.tokenIndex??from;
    if(to>=bad||node.exception||node.children?.[0]?.exception)break;
    const ts=stream.tokens.slice(from,to+1).filter(t=>t.channel===0);
    const wide=ts[0]?.text==='wide',op=ts[wide?1:0],arg=ts[wide?2:1],name=op?.text;
    if(!op)continue;
    const edit=(token,text)=>({start:token.start,end:token.stop+1,text});
    const report=(code,message,severity='warning',title,edits)=>result.push({code,message,severity,start:node.start.start,end:node.stop.stop+1,title,edits});
    const replace=(replacement,removeArg=false)=>[edit(op,replacement),...(removeArg?[edit(arg,'')]:[]),...(wide?[edit(ts[0],'')]:[])];
    if(terminated)report('unreachable',`${terminated} の後の命令には到達できません（次のラベルまで）。`);
    if(/^(goto(?:_w)?|[ilfda]?return|athrow|tableswitch|lookupswitch)$/.test(name))terminated=name;
    if(/^[ilfda]?return$/.test(name)&&expected&&name!==expected)report('return-type',`戻り値 ${returnType} には ${expected} が必要です。スタックの型も確認してください。`,'error');
    const value=integer(arg?.text);
    if(['bipush','sipush','ldc'].includes(name)&&value!==undefined){
     const replacement=value>=-1&&value<=5?'iconst_'+(value===-1?'m1':value):value>=-128&&value<=127?'bipush':value>=-32768&&value<=32767?'sipush':'ldc';
     if(name!==replacement){
      const overflow=name==='bipush'&&(value< -128||value>127)||name==='sipush'&&(value< -32768||value>32767);
      const short=replacement.startsWith('iconst_'),title=`${replacement}${short?'':' '+arg.text} に変更`;
      report(overflow?'push-range':'short-push',overflow?`${name} の範囲外です。${title}してください。`:`より短い命令を使用できます。${title}。`,overflow?'error':'warning',title,replace(replacement,short));
     }
    }
    if(/^(?:[ilfda](?:load|store)|ret|iinc)$/.test(name)&&value!==undefined){
     const increment=name==='iinc'?integer(ts[wide?3:2]?.text):0;
     if(value<0||value>65534||(/^[ld]/.test(name)&&value>65533)){
      report('local-range','ローカル変数番号が範囲外です（2 スロット型は 0〜65533，その他は 0〜65534）。','error');continue;
     }
     if(increment===undefined)continue;
     if(increment< -32768||increment>32767){report('increment-range','iinc の増分は -32768〜32767 にしてください。','error');continue;}
     const needsWide=value>255||increment< -128||increment>127;
     if(needsWide&&!wide){report('missing-wide','このローカル変数番号または増分には wide が必要です。','error','wide を付ける',[{start:op.start,end:op.start,text:'wide '}]);}
     else if(value<=3&&/^[ilfda](?:load|store)$/.test(name)){
      const replacement=name+'_'+value;report('short-local',`短縮形 ${replacement} を使用できます。`,'warning',replacement+' に変更',replace(replacement,true));
     }else if(wide&&!needsWide)report('extra-wide','この命令には wide は不要です。','warning','不要な wide を除去',[edit(ts[0],'')]);
    }
   }
  }
 }catch{/* Incomplete source is handled by the compiler's syntax diagnostics. */}
 return result;
}
