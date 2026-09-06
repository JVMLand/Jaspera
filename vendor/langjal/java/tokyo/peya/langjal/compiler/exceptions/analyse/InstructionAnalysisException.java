package tokyo.peya.langjal.compiler.exceptions.analyse;

import tokyo.peya.langjal.analyser.stack.StackElement;
import tokyo.peya.langjal.compiler.member.InstructionInfo;

/** Retains the consuming instruction and popped slot, rather than the producer's location. */
public final class InstructionAnalysisException extends ClassAnalyseException {
    public final InstructionInfo instruction;
    public final int consumedSlots;
    public final StackElement expected, actual;
    public InstructionAnalysisException(InstructionInfo instruction, int consumedSlots,
                                        StackElement expected, StackElement actual, ClassAnalyseException cause) {
        super(cause.getDetailedMessage());
        this.instruction=instruction; this.consumedSlots=consumedSlots;
        this.expected=expected; this.actual=actual; initCause(cause);
    }
}
