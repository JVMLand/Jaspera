/** Complete, independently analyzable examples. No execution is needed for frame hovers. */
export function instructionUsage(op:string){
 const value=(t:string,n=3)=>t==='a'?'ldc "Hello"':t==='l'?`ldc2_w ${n}L`:t==='d'?`ldc2_w ${n}.0d`:t==='f'?`ldc ${n}.0f`:`bipush ${n}`;
 const discard=(t:string)=>'ld'.includes(t)?'pop2':'pop';
 const descriptor:Record<string,string>={i:'I',l:'J',f:'F',d:'D',a:'Ljava/lang/String;',b:'B',c:'C',s:'S'};
 let lines:string[]=[],result='V',parameters='',members='',legacy=false;
 let m:RegExpMatchArray|null;
 if(m=op.match(/^([ilfda])(load|store)(?:_([0-3]))?$/)){
  const [,t,action,n]=m,slot=n??'1',instruction=n===undefined?`${op} ${slot}`:op;
  lines=action==='load'?[value(t),`${t}store ${slot}`,instruction,discard(t)]:[value(t),instruction,`${t}load ${slot}`,discard(t)];
 }else if(/const_|^[bs]ipush$|^ldc/.test(op)){
  const ins=op==='ldc2_w'?'ldc2_w 12L':/^ldc/.test(op)?`${op} "Hello"`:op==='bipush'?'bipush 12':op==='sipush'?'sipush 1000':op;
  const t=op==='ldc2_w'?'l':/^[ld]const/.test(op)?op[0]:'a';lines=[ins,discard(t)];
 }else if(m=op.match(/^([ilfd])(add|sub|mul|div|rem|and|or|xor|shl|shr|ushr)$/)){
  const t=m[1];lines=[value(t,7),value(/sh/.test(m[2])?'i':t,2),op,discard(t)];
 }else if(/^[ilfd]neg$/.test(op))lines=[value(op[0]),op,discard(op[0])];
 else if(/^[ilfd]2/.test(op))lines=[value(op[0]),op,discard(op[2])];
 else if(op==='iinc')lines=['iconst_3','istore_1','iinc 1 2','iload_1','pop'];
 else if(m=op.match(/^([ilfdabcs])a(load|store)$/)){
  const t=m[1],array=t==='a'?'anewarray Ljava/lang/String;':`newarray ${descriptor[t]}`;
  lines=['iconst_2',array,'astore_0','aload_0','iconst_0',value(t==='b'||t==='c'||t==='s'?'i':t),`${t}astore`];
  if(m[2]==='load')lines.push('aload_0','iconst_0',op,discard(t));else lines.push('aload_0','arraylength','pop');
 }else if(/^(get|put)(field|static)$/.test(op)){
  members='  public value:I\n  public static count:I\n  public <init>()V {\n    aload_0\n    invokespecial java/lang/Object-><init>()V\n    return\n  }\n';
  const instance=op.endsWith('field'),put=op.startsWith('put');
  lines=[...(instance?['new InstructionExample','dup','invokespecial InstructionExample-><init>()V']:[]),...(put?['bipush 7']:[]),`${op} InstructionExample->${instance?'value':'count'}:I`,...(!put?['pop']:[])];
 }else if(op==='invokevirtual')lines=['getstatic java/lang/System->out:Ljava/io/PrintStream;','ldc "Hello"','invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V'];
 else if(op==='invokestatic')lines=['bipush -7','invokestatic java/lang/Math->abs(I)I','pop'];
 else if(op==='invokespecial')lines=['new java/lang/StringBuilder','dup','invokespecial java/lang/StringBuilder-><init>()V','pop'];
 else if(op==='invokeinterface')lines=['new java/util/ArrayList','dup','invokespecial java/util/ArrayList-><init>()V','invokeinterface java/util/List->size()I','pop'];
 else if(op==='invokedynamic')lines=['bipush 7','invokedynamic makeConcat(I)Ljava/lang/String; MethodHandle|invokestatic|java/lang/invoke/StringConcatFactory->makeConcat(Ljava/lang/invoke/MethodHandles$Lookup;Ljava/lang/String;Ljava/lang/invoke/MethodType;)Ljava/lang/invoke/CallSite;','pop'];
 else if(/^[ilfda]?return$/.test(op)){
  result=op==='return'?'V':descriptor[op[0]];lines=op==='return'?['iconst_1','istore_0','return']:[value(op[0]),op];
 }else if(op==='athrow')lines=['new java/lang/IllegalArgumentException','dup','ldc "invalid value"','invokespecial java/lang/IllegalArgumentException-><init>(Ljava/lang/String;)V','athrow'];
 else if(/^if/.test(op)){
  const ref=/acmp|null/.test(op),pair=/cmp/.test(op);
  lines=[ref?'aconst_null':'iconst_1',...(pair?[ref?'aconst_null':'iconst_2']:[]),`${op} Match`,'iconst_0','ireturn','Match:','iconst_1','ireturn'];result='I';
 }else if(/^[lfd]cmp/.test(op))lines=[value(op[0],3),value(op[0],7),op,'pop'];
 else if(/switch$/.test(op)){
  lines=['iconst_1',op==='tableswitch'?'tableswitch 0 { Zero, One } default Other':'lookupswitch { 0: Zero, 1: One, default: Other }','Zero:','iconst_0','ireturn','One:','iconst_1','ireturn','Other:','iconst_m1','ireturn'];result='I';
 }else if(/^goto/.test(op))lines=['iconst_1',`${op} Done`,'Done:','pop'];
 else if(/^jsr/.test(op)||op==='ret'){
  legacy=true;lines=['iconst_0','istore_0',`${op==='jsr_w'?'jsr_w':'jsr'} Cleanup`,'return','Cleanup:','astore_1','iinc 0 1','ret 1'];
 }else if(op==='new')lines=['new java/lang/StringBuilder','dup','invokespecial java/lang/StringBuilder-><init>()V','pop'];
 else if(op==='newarray')lines=['iconst_3','newarray I','arraylength','pop'];
 else if(op==='anewarray')lines=['iconst_3','anewarray Ljava/lang/String;','arraylength','pop'];
 else if(op==='multianewarray')lines=['iconst_2','iconst_3','multianewarray [[I 2','arraylength','pop'];
 else if(op==='arraylength')lines=['iconst_3','newarray I','arraylength','pop'];
 else if(op==='checkcast')lines=['ldc "Hello"','checkcast Ljava/lang/String;','invokevirtual java/lang/String->length()I','pop'];
 else if(op==='instanceof')lines=['ldc "Hello"','instanceof Ljava/lang/String;','pop'];
 else if(op.startsWith('monitor')){parameters='Ljava/lang/Object;';lines=['aload_0','monitorenter','iconst_1','istore_1','aload_0','monitorexit'];}
 else if(op==='nop')lines=['iconst_1','nop','pop'];
 else if(op==='wide')lines=['iconst_3','wide istore 256','wide iload 256','pop'];
 else {
  const operands:Record<string,number>={pop:1,pop2:2,dup:1,dup_x1:2,dup_x2:3,dup2:2,dup2_x1:3,dup2_x2:4,swap:2};
  const count=operands[op];if(!count)throw new Error(`Missing usage: ${op}`);
  const remaining=op==='pop'?0:op==='pop2'?0:op==='swap'?count:count+(op.startsWith('dup2')?2:1);
  lines=[...Array.from({length:count},(_,i)=>`iconst_${i+1}`),op,...Array.from({length:remaining},()=> 'pop')];
 }
 if(!/^(?:[ilfda]?return|athrow|ret)(?: |$)/.test(lines.at(-1)!))lines.push('return');
 const source=`public class InstructionExample${legacy?' (major_version = 49, minor_version = 0)':''} {\n${members}  public static sample(${parameters})${result} {\n${lines.map(line=>(line.endsWith(':')?'  ':'    ')+line).join('\n')}\n  }\n}`;
 return {source,legacy};
}
