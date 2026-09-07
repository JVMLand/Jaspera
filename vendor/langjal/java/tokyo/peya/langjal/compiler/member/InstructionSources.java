package tokyo.peya.langjal.compiler.member;

import java.util.Map;
import java.util.IdentityHashMap;
import org.antlr.v4.runtime.ParserRuleContext;
import org.objectweb.asm.tree.AbstractInsnNode;

/** Source spans retained for one compilation, then explicitly released by the bridge. */
public final class InstructionSources {
    private static final Map<AbstractInsnNode, ParserRuleContext> sources = new IdentityHashMap<>();
    private static final java.util.Set<AbstractInsnNode> labelled = java.util.Collections.newSetFromMap(new IdentityHashMap<>());
    public static void clear() { sources.clear(); labelled.clear(); }
    public static void markLabel(AbstractInsnNode instruction) { labelled.add(instruction); }
    public static boolean hasLabel(AbstractInsnNode instruction) { return labelled.contains(instruction); }
    public static void put(AbstractInsnNode instruction, ParserRuleContext source) { sources.put(instruction, source); }
    public static ParserRuleContext get(AbstractInsnNode instruction) { return sources.get(instruction); }
}
