package jalweb;

import java.util.*;
import org.antlr.v4.runtime.misc.Interval;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.tree.analysis.*;
import tokyo.peya.langjal.compiler.member.InstructionSources;

/** SourceInterpreter carries every possible producer through branches and loops. */
final class InstructionGraph {
    static final class Inputs extends Frame<SourceValue> {
        final List<SourceValue> consumed=new ArrayList<>();
        Inputs(Frame<SourceValue> frame){super(frame);}
        @Override public SourceValue pop(){SourceValue value=super.pop();consumed.add(value);return value;}
    }
    static String compute(String owner,MethodNode method,Frame<BasicValue>[] frames) throws AnalyzerException {
        SourceInterpreter interpreter=new SourceInterpreter();
        Map<Integer,Set<Integer>> control=new HashMap<>();
        Analyzer<SourceValue> analyzer=new Analyzer<>(interpreter){
            @Override protected void newControlFlowEdge(int from,int to){control.computeIfAbsent(from,key->new LinkedHashSet<>()).add(to);}
        };
        Frame<SourceValue>[] sources=analyzer.analyze(owner,method);
        Map<AbstractInsnNode,String> ids=new IdentityHashMap<>();
        for(int i=0;i<method.instructions.size();i++){AbstractInsnNode insn=method.instructions.get(i);if(InstructionSources.get(insn)!=null)ids.put(insn,"n"+i);}
        List<String> nodes=new ArrayList<>();Set<String> edges=new LinkedHashSet<>();Set<AbstractInsnNode> leaders=Collections.newSetFromMap(new IdentityHashMap<>());
        for(AbstractInsnNode insn:method.instructions){
            if(InstructionSources.hasLabel(insn))leaders.add(insn);
            int opcode=insn.getOpcode();
            if((opcode>=Opcodes.IRETURN&&opcode<=Opcodes.RETURN)||opcode==Opcodes.ATHROW||opcode==Opcodes.RET||insn instanceof TableSwitchInsnNode||insn instanceof LookupSwitchInsnNode)leaders.add(real(insn.getNext()));
            if(insn instanceof JumpInsnNode jump){leaders.add(real(jump.label));leaders.add(real(insn.getNext()));}
            if(insn instanceof TableSwitchInsnNode sw){leaders.add(real(sw.dflt));for(LabelNode label:sw.labels)leaders.add(real(label));}
            if(insn instanceof LookupSwitchInsnNode sw){leaders.add(real(sw.dflt));for(LabelNode label:sw.labels)leaders.add(real(label));}
        }
        for(TryCatchBlockNode handler:method.tryCatchBlocks){leaders.add(real(handler.start));leaders.add(real(handler.end));leaders.add(real(handler.handler));}
        Map<AbstractInsnNode,String> blocks=new IdentityHashMap<>();
        int block=-1;
        for(AbstractInsnNode insn:method.instructions)if(ids.containsKey(insn)){
            if(block<0||leaders.contains(insn))block++;
            blocks.put(insn,"B"+block);
        }
        for(int i=0;i<method.instructions.size();i++){
            AbstractInsnNode insn=method.instructions.get(i);String id=ids.get(insn);if(id==null)continue;
            var source=InstructionSources.get(insn);String text=source.start.getInputStream().getText(Interval.of(source.start.getStartIndex(),source.stop.getStopIndex())).replaceAll("\\s+"," ");
            Frame<BasicValue> before=frames[i];int consumed=0,produced=0;
            if(before!=null){
                StackFrames.Transition after=new StackFrames.Transition(before);after.execute(insn,new StackFrames.Verifier());consumed=before.getStackSize()-after.untouched;produced=after.getStackSize()-after.untouched;
                Inputs input=new Inputs(sources[i]);input.execute(insn,interpreter);
                for(SourceValue value:input.consumed)dependencies(edges,ids,value,id,"stack");
                int local=insn instanceof IincInsnNode inc?inc.var:insn instanceof VarInsnNode variable&&(insn.getOpcode()<=Opcodes.ALOAD||insn.getOpcode()==Opcodes.RET)?variable.var:-1;
                if(local>=0)dependencies(edges,ids,sources[i].getLocal(local),id,"local");
            }
            nodes.add("{\"id\":"+Bridge.quote(id)+",\"text\":"+Bridge.quote(text)+",\"opcode\":"+Bridge.quote(source.start.getText())+",\"block\":"+Bridge.quote(blocks.get(insn))+",\"line\":"+source.start.getLine()+",\"column\":"+(source.start.getCharPositionInLine()+1)+",\"consumed\":"+consumed+",\"produced\":"+produced+",\"unreachable\":"+(before==null)+"}");
            int opcode=insn.getOpcode();
            if(insn instanceof JumpInsnNode jump){edge(edges,id,ids.get(real(jump.label)),"control",opcode==Opcodes.GOTO?"jump":opcode==Opcodes.JSR?"call":"true");if(opcode!=Opcodes.GOTO&&opcode!=Opcodes.JSR)edge(edges,id,ids.get(real(insn.getNext())),"control","false");}
            else if(insn instanceof TableSwitchInsnNode sw){edge(edges,id,ids.get(real(sw.dflt)),"control","default");for(int n=0;n<sw.labels.size();n++)edge(edges,id,ids.get(real(sw.labels.get(n))),"control",Integer.toString(sw.min+n));}
            else if(insn instanceof LookupSwitchInsnNode sw){edge(edges,id,ids.get(real(sw.dflt)),"control","default");for(int n=0;n<sw.labels.size();n++)edge(edges,id,ids.get(real(sw.labels.get(n))),"control",sw.keys.get(n).toString());}
            else if(opcode==Opcodes.RET){for(int next:control.getOrDefault(i,Set.of()))edge(edges,id,ids.get(real(method.instructions.get(next))),"control","return");}
            else if(!(opcode>=Opcodes.IRETURN&&opcode<=Opcodes.RETURN)&&opcode!=Opcodes.ATHROW&&opcode!=Opcodes.RET)edge(edges,id,ids.get(real(insn.getNext())),"control","");
        }
        record ExceptionRoute(String from,String to) {}
        Map<ExceptionRoute,Set<String>> exceptions=new LinkedHashMap<>();
        for(TryCatchBlockNode handler:method.tryCatchBlocks){
            Set<String> protectedBlocks=new LinkedHashSet<>();
            for(AbstractInsnNode insn=handler.start;insn!=null&&insn!=handler.end;insn=insn.getNext()){
                String group=blocks.get(insn);if(group!=null)protectedBlocks.add(group);
            }
            String target=blocks.get(real(handler.handler));
            if(target!=null)for(String group:protectedBlocks)exceptions.computeIfAbsent(new ExceptionRoute(group,target),key->new LinkedHashSet<>()).add(handler.type==null?"finally":handler.type.substring(handler.type.lastIndexOf('/')+1));
        }
        for(var route:exceptions.entrySet())edge(edges,route.getKey().from(),route.getKey().to(),"exception",String.join("\n",route.getValue()));
        return "{\"name\":"+Bridge.quote(method.name+method.desc)+",\"nodes\":["+String.join(",",nodes)+"],\"edges\":["+String.join(",",edges)+"]}";
    }
    static AbstractInsnNode real(AbstractInsnNode insn){while(insn!=null&&insn.getOpcode()<0)insn=insn.getNext();return insn;}
    static void dependencies(Set<String> edges,Map<AbstractInsnNode,String> ids,SourceValue value,String target,String kind){if(value!=null)for(AbstractInsnNode producer:value.insns)edge(edges,ids.get(producer),target,kind,"");}
    static void edge(Set<String> edges,String from,String to,String kind,String label){if(from!=null&&to!=null)edges.add("{\"from\":"+Bridge.quote(from)+",\"to\":"+Bridge.quote(to)+",\"kind\":"+Bridge.quote(kind)+",\"label\":"+Bridge.quote(label)+"}");}
}
