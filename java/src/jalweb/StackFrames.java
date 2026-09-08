package jalweb;

import java.util.*;
import org.antlr.v4.runtime.ParserRuleContext;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.tree.analysis.*;
import tokyo.peya.langjal.compiler.member.InstructionSources;

final class StackFrames {

    static final class Verifier extends BasicVerifier {

        Verifier() {
            super(Opcodes.ASM9);
        }

        @Override
        public BasicValue newValue(Type type) {
            return type != null && (type.getSort() == Type.OBJECT || type.getSort() == Type.ARRAY)
                ? new BasicValue(type)
                : super.newValue(type);
        }

        @Override
        protected boolean isSubTypeOf(BasicValue value, BasicValue expected) {
            return (
                (value.isReference() && expected.isReference()) ||
                super.isSubTypeOf(value, expected)
            );
        }

        @Override
        public BasicValue merge(BasicValue a, BasicValue b) {
            if (a.equals(b)) return a;
            if (a.isReference() && b.isReference()) return BasicValue.REFERENCE_VALUE;
            return super.merge(a, b);
        }
    }

    static String value(BasicValue value) {
        if (value == null || value == BasicValue.UNINITIALIZED_VALUE) return "未設定";
        if (value == BasicValue.RETURNADDRESS_VALUE) return "戻り先";
        return value.getType() == null ? "不明" : value.getType().getClassName();
    }

    static final class Origins extends SourceInterpreter {

        Origins() {
            super(Opcodes.ASM9);
        }

        @Override
        public SourceValue copyOperation(AbstractInsnNode insn, SourceValue value) {
            return value;
        }
    }

    static String value(BasicValue value, SourceValue origin) {
        String type = value(value);
        if (origin == null || origin.insns.size() != 1) return type;
        AbstractInsnNode producer = origin.insns.iterator().next();
        int opcode = producer.getOpcode();
        String constant = null;
        if (opcode == Opcodes.ACONST_NULL) return "null";
        if (opcode >= Opcodes.ICONST_M1 && opcode <= Opcodes.ICONST_5) constant = Integer.toString(
            opcode - Opcodes.ICONST_0
        );
        else if (opcode >= Opcodes.LCONST_0 && opcode <= Opcodes.LCONST_1) constant =
            Integer.toString(opcode - Opcodes.LCONST_0);
        else if (opcode >= Opcodes.FCONST_0 && opcode <= Opcodes.FCONST_2) constant =
            Integer.toString(opcode - Opcodes.FCONST_0);
        else if (opcode >= Opcodes.DCONST_0 && opcode <= Opcodes.DCONST_1) constant =
            Integer.toString(opcode - Opcodes.DCONST_0);
        else if (
            producer instanceof IntInsnNode operand &&
            (opcode == Opcodes.BIPUSH || opcode == Opcodes.SIPUSH)
        ) constant = Integer.toString(operand.operand);
        else if (
            producer instanceof LdcInsnNode ldc &&
            (ldc.cst instanceof String || ldc.cst instanceof Number)
        ) constant =
            ldc.cst instanceof String ? Bridge.quote(ldc.cst.toString()) : ldc.cst.toString();
        if (constant == null) return type;
        if (constant.length() > 48) constant = constant.substring(0, 45) + "…";
        return constant + " : " + type;
    }

    static String stack(Frame<BasicValue> frame, Frame<SourceValue> origins) {
        List<String> values = new ArrayList<>();
        for (int i = 0; i < frame.getStackSize(); i++) values.add(
            Bridge.quote(value(frame.getStack(i), origins == null ? null : origins.getStack(i)))
        );
        return "[" + String.join(",", values) + "]";
    }

    static String locals(Frame<BasicValue> frame, Frame<SourceValue> origins) {
        List<String> values = new ArrayList<>();
        int last = frame.getLocals() - 1;
        while (last >= 0 && frame.getLocal(last) == BasicValue.UNINITIALIZED_VALUE) last--;
        if (
            last >= 0 && frame.getLocal(last).getSize() == 2 && last + 1 < frame.getLocals()
        ) last++;
        for (int i = 0; i <= last; i++) {
            BasicValue value = frame.getLocal(i);
            values.add(
                Bridge.quote(
                    i > 0 && frame.getLocal(i - 1) != null && frame.getLocal(i - 1).getSize() == 2
                        ? "継続スロット"
                        : value(value, origins == null ? null : origins.getLocal(i))
                )
            );
        }
        return "[" + String.join(",", values) + "]";
    }

    // Track operations, not value/type equality: iadd consumes two ints and creates a new int.
    static final class Transition extends Frame<BasicValue> {

        int untouched;

        Transition(Frame<BasicValue> before) {
            super(before);
            untouched = before.getStackSize();
        }

        @Override
        public BasicValue pop() {
            BasicValue value = super.pop();
            untouched = Math.min(untouched, getStackSize());
            return value;
        }
    }

    static void append(
        List<String> result,
        MethodNode method,
        Frame<BasicValue>[] frames,
        BasicVerifier verifier
    ) throws AnalyzerException {
        Origins origins = new Origins();
        Frame<SourceValue>[] originFrames = new Analyzer<>(origins).analyze(
            "java/lang/Object",
            method
        );
        for (int i = 0; i < method.instructions.size(); i++) {
            AbstractInsnNode instruction = method.instructions.get(i);
            ParserRuleContext source = InstructionSources.get(instruction);
            if (source == null || instruction.getOpcode() < 0) continue;
            String prefix =
                "{\"line\":" +
                source.start.getLine() +
                ",\"column\":" +
                (source.start.getCharPositionInLine() + 1) +
                ",\"length\":" +
                (source.start.getStopIndex() - source.start.getStartIndex() + 1);
            Frame<BasicValue> before = frames[i];
            if (before == null) {
                result.add(prefix + ",\"unreachable\":true}");
                continue;
            }
            Transition after = new Transition(before);
            after.execute(instruction, verifier);
            Frame<SourceValue> originBefore = originFrames[i],
                originAfter = originBefore == null ? null : new Frame<>(originBefore);
            if (originAfter != null) originAfter.execute(instruction, origins);
            int opcode = instruction.getOpcode();
            String terminal =
                opcode >= Opcodes.IRETURN && opcode <= Opcodes.RETURN
                    ? "メソッド終了"
                    : opcode == Opcodes.ATHROW
                      ? "例外ハンドラーまたは呼び出し元へ"
                      : "";
            String effect = "";
            int local = -1;
            if (instruction instanceof IincInsnNode increment) {
                local = increment.var;
                effect =
                    "#" +
                    local +
                    " ← #" +
                    local +
                    (increment.incr >= 0 ? " + " : " − ") +
                    Math.abs((long) increment.incr);
            } else if (
                instruction instanceof VarInsnNode variable &&
                instruction.getOpcode() >= Opcodes.ISTORE &&
                instruction.getOpcode() <= Opcodes.ASTORE
            ) {
                local = variable.var;
                effect = "#" + local + " ← スタック TOP";
            }
            result.add(
                prefix +
                    ",\"consumed\":" +
                    (before.getStackSize() - after.untouched) +
                    ",\"produced\":" +
                    (after.getStackSize() - after.untouched) +
                    ",\"terminal\":" +
                    Bridge.quote(terminal) +
                    ",\"before\":" +
                    stack(before, originBefore) +
                    ",\"after\":" +
                    stack(after, originAfter) +
                    ",\"local\":" +
                    local +
                    ",\"effect\":" +
                    Bridge.quote(effect) +
                    (local < 0
                        ? ""
                        : ",\"localsBefore\":" +
                          locals(before, originBefore) +
                          ",\"localsAfter\":" +
                          locals(after, originAfter)) +
                    "}"
            );
        }
    }
}
