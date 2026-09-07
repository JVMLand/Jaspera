// Related pages are explicit families, not every instruction in the same category.
const families = [
 ['ireturn','lreturn','freturn','dreturn','areturn','return'],
 ['invokevirtual','invokeinterface','invokespecial','invokestatic','invokedynamic'],
 ['iconst_m1','iconst_0','iconst_1','iconst_2','iconst_3','iconst_4','iconst_5','bipush','sipush','ldc','ldc_w'],
 ['lconst_0','lconst_1','ldc2_w'], ['fconst_0','fconst_1','fconst_2','ldc','ldc_w'], ['dconst_0','dconst_1','ldc2_w'],
 ['ldc','ldc_w','ldc2_w'], ['getfield','putfield','getstatic','putstatic'],
 ['pop','pop2'], ['dup','dup_x1','dup_x2','dup2','dup2_x1','dup2_x2','swap'],
 ['ifeq','ifne','iflt','ifge','ifgt','ifle'],
 ['if_icmpeq','if_icmpne','if_icmplt','if_icmpge','if_icmpgt','if_icmple'],
 ['if_acmpeq','if_acmpne','ifnull','ifnonnull'],
 ['lcmp','fcmpl','fcmpg','dcmpl','dcmpg'], ['goto','goto_w'], ['tableswitch','lookupswitch'],
 ['jsr','jsr_w','ret'], ['newarray','anewarray','multianewarray','arraylength'],
 ['checkcast','instanceof'], ['monitorenter','monitorexit'],
 ...'ilfda'.split('').map(t=>[t+'load',t+'store',...[0,1,2,3].flatMap(n=>[`${t}load_${n}`,`${t}store_${n}`])]),
 ...'ilfdabcs'.split('').map(t=>[t+'aload',t+'astore']),
 ...'ilfd'.split('').map(t=>['add','sub','mul','div','rem','neg'].map(op=>t+op)),
 ...'il'.split('').map(t=>['and','or','xor','shl','shr','ushr'].map(op=>t+op)),
 ...'ilfd'.split('').map(t=>'ilfdbcs'.split('').filter(to=>to!==t&&(t==='i'||!'bcs'.includes(to))).map(to=>`${t}2${to}`)),
];
const companions:Record<string,string[]>={
 new:['dup','invokespecial'], invokespecial:['new'], aconst_null:['ifnull','ifnonnull'],
 instanceof:['ifeq','ifne'], iinc:['iload','istore','iadd','wide'],
 jsr:['astore'],jsr_w:['astore'],ret:['astore','return','wide'],astore:['ret'],
 wide:['iload','lload','fload','dload','aload','istore','lstore','fstore','dstore','astore','iinc','ret'],
 lcmp:['ifeq','ifne','iflt','ifge','ifgt','ifle'],
 fcmpl:['ifgt','ifge'],fcmpg:['iflt','ifle'],dcmpl:['ifgt','ifge'],dcmpg:['iflt','ifle'],
};
export function relatedInstructions(op:string):string[]{
 const related=families.filter(f=>f.includes(op)).flat();
 if(/^if_icmp/.test(op))related.push('lcmp','fcmpl','fcmpg','dcmpl','dcmpg');
 if(/^[ilfda](load|store)$/.test(op))related.push('wide');
 return [...new Set([...related,...companions[op]??[]])].filter(other=>other!==op);
}
