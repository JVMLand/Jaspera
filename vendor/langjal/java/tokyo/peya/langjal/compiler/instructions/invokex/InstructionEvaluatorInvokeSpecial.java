package tokyo.peya.langjal.compiler.instructions.invokex;

import org.jetbrains.annotations.NotNull;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import tokyo.peya.langjal.analyser.FrameDifferenceInfo;
import tokyo.peya.langjal.analyser.stack.StackElementCapsule;
import tokyo.peya.langjal.compiler.FileEvaluatingReporter;
import tokyo.peya.langjal.compiler.JALParser;
import tokyo.peya.langjal.compiler.instructions.AbstractInstructionEvaluator;
import tokyo.peya.langjal.compiler.jvm.EOpcodes;
import tokyo.peya.langjal.compiler.jvm.MethodDescriptor;
import tokyo.peya.langjal.compiler.jvm.TypeDescriptor;
import tokyo.peya.langjal.compiler.member.*;

public class InstructionEvaluatorInvokeSpecial
        extends AbstractInstructionEvaluator<JALParser.JvmInsInvokespecialContext> {
    public InstructionEvaluatorInvokeSpecial() {
        super(EOpcodes.INVOKESPECIAL);
    }

    private static void opSpecialInvocation(@NotNull InstructionInfo instruction,
                                            @NotNull FrameDifferenceInfo.Builder builder,
                                            @NotNull MethodInsnNode method) {
        if (method.name.equals("<init>"))
            builder.popToCapsule(new StackElementCapsule(instruction));
        else
            builder.popObjectRef();
    }

    @Override
    @NotNull
    public EvaluatedInstruction evaluate(@NotNull FileEvaluatingReporter context,
                                         @NotNull ClassNode clazz, @NotNull MethodNode method,
                                         @NotNull InstructionsHolder instructions, @NotNull LabelsHolder labels,
                                         @NotNull LocalVariablesHolder locals,
                                         JALParser.@NotNull JvmInsInvokespecialContext instruction) {
        JALParser.JvmInsArgMethodRefContext ref = instruction.jvmInsArgMethodRef();
        String methodName = ref.methodName().getText();

        // Owner が指定されていない場合は，命令を持つメソッドのクラスが所有者となる
        String ownerName = InstructionEvaluateHelperInvocation.methodOwner(ref, clazz.name);

        return InstructionEvaluateHelperInvocation.evaluate(
                this,
                ownerName,
                methodName,
                ref.methodDescriptor().getText(),
                EOpcodes.INVOKESPECIAL
        );
    }

    @Override
    public FrameDifferenceInfo getFrameDifferenceInfo(@NotNull InstructionInfo instruction) {
        MethodInsnNode method = (MethodInsnNode) instruction.insn();
        MethodDescriptor descriptor = MethodDescriptor.parse(method.desc);
        TypeDescriptor returnTypeDesc = descriptor.getReturnType();
        TypeDescriptor[] parameterTypes = descriptor.getParameterTypes();

        FrameDifferenceInfo.Builder builder = FrameDifferenceInfo.builder(instruction);
        InstructionEvaluateHelperInvocation.opArguments(
                builder,
                instruction,
                parameterTypes
        );

        opSpecialInvocation(instruction, builder, method);

        // 戻り値の型に応じてスタックを調整
        InstructionEvaluateHelperInvocation.opReturnType(
                builder,
                instruction,
                returnTypeDesc
        );
        return builder.build();
    }

    @Override
    public JALParser.JvmInsInvokespecialContext map(JALParser.@NotNull InstructionContext instruction) {
        return instruction.jvmInsInvokespecial();
    }
}
