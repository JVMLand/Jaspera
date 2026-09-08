package jalweb;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import tokyo.peya.langjal.compiler.jvm.EOpcodes;

/** JALP-style rendering over ASM's validated class reader. Never defines or executes the input class. */
public final class Disassembler {

    private final StringBuilder out = new StringBuilder();
    private final List<Integer> instructionOffsets = new ArrayList<>();
    private final List<String> locations = new ArrayList<>();
    private int instructionIndex = 0,
        sourceLine = 1;

    private void line(String text) {
        out.append(text).append('\n');
        sourceLine++;
        if (out.length() > 1024 * 1024) throw new IllegalArgumentException(
            "逆アセンブル結果は 1 MiB 以下にしてください。"
        );
    }

    private static String clean(String s) {
        return s.replace('\r', ' ').replace('\n', ' ');
    }

    private static String type(String s) {
        return s.startsWith("[") ? s : "L" + s + ";";
    }

    private static String flags(int access, int kind) {
        StringBuilder s = new StringBuilder();
        int[] bits = { 1, 2, 4, 8, 16, 32, 64, 128, 256, 1024, 2048, 4096, 8192, 16384 };
        String[] names = {
            "public",
            "private",
            "protected",
            "static",
            "final",
            kind == 0 ? "super" : "synchronized",
            kind == 1 ? "volatile" : "bridge",
            kind == 1 ? "transient" : "varargs",
            "native",
            "abstract",
            "strictfp",
            "synthetic",
            "annotation",
            "enum",
        };
        for (int i = 0; i < bits.length; i++) if ((access & bits[i]) != 0) s.append(
            names[i]
        ).append(' ');
        if (kind == 0 && (access & Opcodes.ACC_INTERFACE) != 0) s.append("interface ");
        return s.toString();
    }

    private String constant(Object c) {
        if (c instanceof String s) return Bridge.quote(s);
        if (c instanceof Long) return c + "L";
        if (c instanceof Float f) {
            return f + "f";
        }
        if (c instanceof Double d) {
            return d + "d";
        }
        if (c instanceof Type t) {
            return t.getSort() == Type.METHOD
                ? "MethodType|" + t.getDescriptor()
                : t.getDescriptor();
        }
        if (c instanceof Handle h) return handle(h);
        if (c instanceof ConstantDynamic d) {
            return (
                "ConstantDynamic " +
                clean(d.getName()) +
                " " +
                d.getDescriptor() +
                " " +
                handle(d.getBootstrapMethod())
            );
        }
        return String.valueOf(c);
    }

    private String handle(Handle h) {
        String[] tags = {
            "",
            "getfield",
            "getstatic",
            "putfield",
            "putstatic",
            "invokevirtual",
            "invokestatic",
            "invokespecial",
            "newinvokespecial",
            "invokeinterface",
        };
        return (
            "MethodHandle|" +
            tags[h.getTag()] +
            "|" +
            h.getOwner() +
            "->" +
            h.getName() +
            (h.getTag() <= 4 ? ":" : "") +
            h.getDesc()
        );
    }

    private String instruction(AbstractInsnNode i, Map<LabelNode, String> labels) {
        String op = EOpcodes.getName(i.getOpcode());
        if (i instanceof VarInsnNode v) {
            if (v.var < 4 && i.getOpcode() != Opcodes.RET) return op + "_" + v.var;
            return (v.var > 255 ? "wide " : "") + op + " " + v.var;
        }
        if (i instanceof IntInsnNode n) {
            if (i.getOpcode() == Opcodes.NEWARRAY) {
                String[] types = { "", "", "", "", "Z", "C", "F", "D", "B", "S", "I", "J" };
                return op + " " + types[n.operand];
            }
            return op + " " + n.operand;
        }
        if (i instanceof TypeInsnNode n) return (
            op + " " + (i.getOpcode() == Opcodes.NEW ? n.desc : type(n.desc))
        );
        if (i instanceof FieldInsnNode n) return op + " " + n.owner + "->" + n.name + ":" + n.desc;
        if (i instanceof MethodInsnNode n) return op + " " + n.owner + "->" + n.name + n.desc;
        if (i instanceof JumpInsnNode n) return op + " " + labels.get(n.label);
        if (i instanceof IincInsnNode n) return (
            (n.var > 255 || n.incr < -128 || n.incr > 127 ? "wide " : "") +
            "iinc " +
            n.var +
            " " +
            n.incr
        );
        if (i instanceof LdcInsnNode n) {
            String value = constant(n.cst);
            if (
                (n.cst instanceof Type t && t.getSort() == Type.METHOD) ||
                n.cst instanceof Handle ||
                n.cst instanceof ConstantDynamic
            ) {
                return "// ldc " + value;
            }
            return (n.cst instanceof Long || n.cst instanceof Double ? "ldc2_w " : "ldc ") + value;
        }
        if (i instanceof MultiANewArrayInsnNode n) return op + " " + n.desc + " " + n.dims;
        if (i instanceof TableSwitchInsnNode n) return (
            op +
            " " +
            n.min +
            " { " +
            String.join(", ", n.labels.stream().map(labels::get).toList()) +
            " } default " +
            labels.get(n.dflt)
        );
        if (i instanceof LookupSwitchInsnNode n) {
            List<String> cases = new ArrayList<>();
            for (int k = 0; k < n.keys.size(); k++) cases.add(
                n.keys.get(k) + ": " + labels.get(n.labels.get(k))
            );
            cases.add("default: " + labels.get(n.dflt));
            return op + " {\n  " + String.join(",\n  ", cases) + "\n}";
        }
        if (i instanceof InvokeDynamicInsnNode n) {
            StringBuilder s = new StringBuilder(
                "invokedynamic " + n.name + " " + n.desc + " " + handle(n.bsm)
            );
            for (Object arg : n.bsmArgs) s.append(' ').append(constant(arg));
            return s.toString();
        }
        return op;
    }

    private void method(MethodNode method) {
        line("");
        line("  " + flags(method.access, 2) + method.name + method.desc + " {");
        if (method.exceptions != null && !method.exceptions.isEmpty()) line(
            "    // throws " + String.join(", ", method.exceptions)
        );
        Map<LabelNode, String> labels = new IdentityHashMap<>();
        Set<LabelNode> used = Collections.newSetFromMap(new IdentityHashMap<>());
        for (AbstractInsnNode i : method.instructions) {
            if (i instanceof JumpInsnNode n) used.add(n.label);
            if (i instanceof TableSwitchInsnNode n) {
                used.add(n.dflt);
                used.addAll(n.labels);
            }
            if (i instanceof LookupSwitchInsnNode n) {
                used.add(n.dflt);
                used.addAll(n.labels);
            }
        }
        for (TryCatchBlockNode t : method.tryCatchBlocks) {
            used.add(t.start);
            used.add(t.end);
            used.add(t.handler);
        }
        int serial = 0;
        for (AbstractInsnNode i : method.instructions)
            if (i instanceof LabelNode l && used.contains(l)) labels.put(l, "L" + serial++);
        for (AbstractInsnNode i : method.instructions) {
            if (i instanceof LabelNode l && used.contains(l)) {
                line("  " + labels.get(l) + ":");
                List<TryCatchBlockNode> catches = method.tryCatchBlocks
                    .stream()
                    .filter(t -> t.start == l)
                    .toList();
                if (!catches.isEmpty()) {
                    LabelNode end = catches.get(0).end;
                    StringBuilder s = new StringBuilder("    [~" + labels.get(end));
                    for (TryCatchBlockNode t : catches)
                        s.append(
                            t.type == null
                                ? " -> " + labels.get(t.handler)
                                : ", " + t.type + ": " + labels.get(t.handler)
                        );
                    line(s + "]");
                }
            } else if (i.getOpcode() >= 0) {
                locations.add(
                    "{\"method\":" +
                        Bridge.quote(method.name + method.desc) +
                        ",\"pc\":" +
                        instructionOffsets.get(instructionIndex++) +
                        ",\"line\":" +
                        sourceLine +
                        "}"
                );
                for (String part : instruction(i, labels).split("\n")) line("    " + part);
            }
        }
        line("  }");
    }

    public static String disassemble(String encoded) {
        byte[] bytes = Base64.getDecoder().decode(encoded);
        if (
            bytes.length < 10 ||
            bytes.length > 1024 * 1024 ||
            bytes[0] != (byte) 0xca ||
            bytes[1] != (byte) 0xfe ||
            bytes[2] != (byte) 0xba ||
            bytes[3] != (byte) 0xbe
        ) throw new IllegalArgumentException(
            "有効な .class ファイル（1 MiB 以下）を指定してください。"
        );
        Disassembler d = new Disassembler();
        ClassNode c = new ClassNode();
        new ClassReader(bytes) {
            @Override
            protected void readBytecodeInstructionOffset(int offset) {
                d.instructionOffsets.add(offset);
            }
        }.accept(c, ClassReader.SKIP_FRAMES);
        d.line("/*");
        d.line("  Decompiled by JALP (Java Assembly Language Parser)");
        d.line("  Class: " + clean(c.name).replace("*/", "* /") + ".class");
        if (c.sourceFile != null) d.line(
            "  Compiled from \"" + clean(c.sourceFile).replace("*/", "* /") + "\""
        );
        d.line("*/");
        d.line("");
        String meta =
            "major_version=" + (c.version & 65535) + ", minor_version=" + (c.version >>> 16);
        if (c.superName != null) meta += ", super_class=" + c.superName;
        if (!c.interfaces.isEmpty()) meta += ", interfaces=" + String.join(", ", c.interfaces);
        d.line(flags(c.access, 0) + "class " + c.name + " (" + meta + ") {");
        for (FieldNode f : c.fields)
            d.line(
                "  " +
                    flags(f.access, 1) +
                    f.name +
                    ":" +
                    f.desc +
                    (f.value == null ? "" : " = " + d.constant(f.value))
            );
        for (MethodNode m : c.methods) d.method(m);
        d.line("}");
        String source = d.out.toString();
        if (
            source.getBytes(StandardCharsets.UTF_8).length > 1024 * 1024
        ) throw new IllegalArgumentException("逆アセンブル結果が大きすぎます。");
        return (
            "{\"className\":" +
            Bridge.quote(c.name) +
            ",\"source\":" +
            Bridge.quote(source) +
            ",\"locations\":[" +
            String.join(",", d.locations) +
            "]}"
        );
    }
}
