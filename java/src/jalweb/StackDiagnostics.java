package jalweb;

import org.antlr.v4.runtime.ParserRuleContext;
import org.antlr.v4.runtime.Token;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.*;
import tokyo.peya.langjal.analyser.stack.*;
import tokyo.peya.langjal.compiler.JALParser;
import tokyo.peya.langjal.compiler.exceptions.analyse.InstructionAnalysisException;
import tokyo.peya.langjal.compiler.jvm.EOpcodes;
import tokyo.peya.langjal.compiler.member.InstructionSources;

/** Converts analyzer operands to precise source ranges and readable JVM types. */
final class StackDiagnostics {
    record Range(int line, int column, int length) {}
    record Problem(String message, Range range) {}
    static ParserRuleContext find(ParserRuleContext node, String rule) {
        if(node==null) return null;
        if(JALParser.ruleNames[node.getRuleIndex()].equals(rule)) return node;
        for(int i=0;i<node.getChildCount();i++) if(node.getChild(i) instanceof ParserRuleContext child) {
            ParserRuleContext found=find(child,rule); if(found!=null)return found;
        }
        return null;
    }
    static Range token(Token token) {
        return new Range(token.getLine(),token.getCharPositionInLine(),token.getStopIndex()-token.getStartIndex()+1);
    }
    static Range opcode(AbstractInsnNode instruction, int fallbackLine) {
        ParserRuleContext source=InstructionSources.get(instruction);
        return source==null?new Range(Math.max(1,fallbackLine),0,1):token(source.start);
    }
    private static Range span(ParserRuleContext node, Range fallback) {
        return node==null?fallback:new Range(node.start.getLine(),node.start.getCharPositionInLine(),node.stop.getStopIndex()-node.start.getStartIndex()+1);
    }
    private static String typeName(StackElement element) {
        if(element instanceof StackElementCapsule capsule) return capsule.getElement()!=null?typeName(capsule.getElement()):capsule.isAcceptsCategoryTwoTop()?"スタックの値":"カテゴリ1の値";
        if(element instanceof ObjectElement object)return Type.getType(object.content().toString()).getClassName();
        return switch(element.type()) {
            case INTEGER -> "int"; case FLOAT -> "float"; case LONG -> "long"; case DOUBLE -> "double";
            case NULL -> "null"; case OBJECT -> "参照型";
            case UNINITIALIZED, UNINITIALIZED_THIS -> "初期化前のオブジェクト";
            case TOP -> "カテゴリ2の値の上位スロット";
            default -> element.type().toString();
        };
    }
    static Problem describe(InstructionAnalysisException error) {
        AbstractInsnNode instruction=error.instruction.insn();
        ParserRuleContext source=InstructionSources.get(instruction);
        Range range=opcode(instruction,error.instruction.sourceLine());
        String subject=EOpcodes.getName(instruction.getOpcode())+" のオペランド";
        String expected=error.expected==null?null:typeName(error.expected);
        if(error.consumedSlots>=0) {
            String descriptor=instruction instanceof MethodInsnNode method?method.desc:
                instruction instanceof InvokeDynamicInsnNode dynamic?dynamic.desc:null;
            if(descriptor!=null) {
                Type[] arguments=Type.getArgumentTypes(descriptor);int slots=0,argument=-1;
                for(int i=arguments.length-1;i>=0;i--){if(error.consumedSlots<slots+arguments[i].getSize()){argument=i;break;}slots+=arguments[i].getSize();}
                if(argument>=0){
                    ParserRuleContext desc=find(source,"methodDescriptor");int offset=1;
                    for(int i=0;i<argument;i++)offset+=arguments[i].getDescriptor().length();
                    if(desc!=null)range=new Range(desc.start.getLine(),desc.start.getCharPositionInLine()+offset,arguments[argument].getDescriptor().length());
                    expected=arguments[argument].getClassName();subject="第"+(argument+1)+"引数";
                } else if(instruction instanceof MethodInsnNode method&&method.getOpcode()!=org.objectweb.asm.Opcodes.INVOKESTATIC){
                    range=span(find(source,"fullQualifiedClassName"),range);expected=Type.getObjectType(method.owner).getClassName();subject="呼び出し先のオブジェクト";
                }
            } else if(instruction instanceof FieldInsnNode field){
                boolean value=(field.getOpcode()==org.objectweb.asm.Opcodes.PUTSTATIC||field.getOpcode()==org.objectweb.asm.Opcodes.PUTFIELD)&&error.consumedSlots<Type.getType(field.desc).getSize();
                range=span(find(source,value?"typeDescriptor":"fullQualifiedClassName"),range);
                expected=value?Type.getType(field.desc).getClassName():Type.getObjectType(field.owner).getClassName();subject=value?"フィールドに代入する値":"フィールドの参照先オブジェクト";
            }
        }
        String message=expected==null?error.getDetailedMessage():error.actual==null?
            subject+"に必要な "+expected+" の値がスタックにありません。":
            subject+"には "+expected+" が必要ですが，スタック上の値は "+typeName(error.actual)+" です。";
        return new Problem(message,range);
    }
}
