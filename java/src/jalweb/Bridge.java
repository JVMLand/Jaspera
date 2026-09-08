package jalweb;

import java.io.*;
import java.lang.reflect.InvocationTargetException;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.antlr.v4.runtime.*;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.tree.analysis.*;
import tokyo.peya.langjal.compiler.*;
import tokyo.peya.langjal.compiler.exceptions.CompileErrorException;
import tokyo.peya.langjal.compiler.exceptions.analyse.InstructionAnalysisException;
import tokyo.peya.langjal.compiler.preprocessor.JALPreprocessor;

/** Browser bridge. Text inputs use base64 UTF-8 and results use ASCII JSON to avoid FFI encoding ambiguities. */
public final class Bridge {

    public record Diagnostic(
        String severity,
        String message,
        long line,
        long column,
        long length
    ) {}

    private static final List<Diagnostic> diagnostics = new ArrayList<>();

    private static void add(String severity, String message, long line, long column, long length) {
        if (diagnostics.size() >= 100) return;
        Diagnostic d = new Diagnostic(
            severity,
            message,
            Math.max(1, line),
            Math.max(1, column + 1),
            Math.max(1, length)
        );
        if (!diagnostics.contains(d)) diagnostics.add(d);
    }

    private static void compileError(CompileErrorException e) {
        if (e instanceof InstructionAnalysisException analysis) {
            StackDiagnostics.Problem problem = StackDiagnostics.describe(analysis);
            StackDiagnostics.Range range = problem.range();
            add("error", problem.message(), range.line(), range.column(), range.length());
        } else add("error", e.getDetailedMessage(), e.getLine(), e.getColumn(), e.getLength());
    }

    private static final CompileReporter REPORTER = new CompileReporter() {
        public boolean isDebugEnabled() {
            return false;
        }

        public boolean isInfoEnabled() {
            return false;
        }

        public void postInfo(String m, Path p) {}

        public void postDebug(String m, Path p) {}

        public void postWarning(String m, Path p) {
            add("warning", m, 1, 0, 1);
        }

        public void postWarning(String m, Path p, long l, long c, long n) {
            add("warning", m, l, c, n);
        }

        public void postWarning(String m, Path p, ParserRuleContext c) {
            add("warning", m, c.start.getLine(), c.start.getCharPositionInLine(), 1);
        }

        public void postError(String m, Path p) {
            add("error", m, 1, 0, 1);
        }

        public void postError(String m, CompileErrorException e, Path p) {
            compileError(e);
        }
    };

    public static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray())
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 32 || c > 126) b.append("\\u")
                        .append("0123456789abcdef".charAt(c >>> 12))
                        .append("0123456789abcdef".charAt((c >>> 8) & 15))
                        .append("0123456789abcdef".charAt((c >>> 4) & 15))
                        .append("0123456789abcdef".charAt(c & 15));
                    else b.append(c);
                }
            }
        return b.append('"').toString();
    }

    private static String diagnosticJson() {
        List<String> entries = new ArrayList<>();
        for (Diagnostic d : diagnostics)
            entries.add(
                "{\"severity\":" +
                    quote(d.severity()) +
                    ",\"message\":" +
                    quote(d.message()) +
                    ",\"line\":" +
                    d.line() +
                    ",\"column\":" +
                    d.column() +
                    ",\"length\":" +
                    d.length() +
                    "}"
            );
        return "[" + String.join(",", entries) + "]";
    }

    private static byte[] readBytes(Path path) throws IOException {
        try (InputStream in = new FileInputStream(path.toFile())) {
            return in.readAllBytes();
        }
    }

    public static String disassemble(String encoded) {
        return Disassembler.disassemble(encoded);
    }

    private static boolean reportProgress;

    private static void progress(
        String phase,
        String owner,
        String method,
        int completed,
        int total
    ) {
        if (reportProgress) System.out.println(
            "\u001eJALWEB_PROGRESS " +
                "{\"phase\":" +
                quote(phase) +
                ",\"owner\":" +
                quote(owner) +
                ",\"method\":" +
                quote(method) +
                ",\"completed\":" +
                completed +
                ",\"total\":" +
                total +
                "}"
        );
    }

    private static void methodProgress(
        String phase,
        String owner,
        String method,
        int completed,
        int total,
        boolean finished,
        String graph
    ) {
        if (reportProgress) System.out.println(
            "\u001eJALWEB_PROGRESS {\"phase\":" +
                quote(phase) +
                ",\"owner\":" +
                quote(owner) +
                ",\"method\":" +
                quote(method) +
                ",\"completed\":" +
                completed +
                ",\"total\":" +
                total +
                ",\"finished\":" +
                finished +
                (graph == null ? "" : ",\"graph\":" + graph) +
                "}"
        );
    }

    public static String compileWithProgress(String encodedSource) {
        reportProgress = true;
        try {
            return compile(encodedSource);
        } finally {
            reportProgress = false;
        }
    }

    /** Bit 0 requests hover frames; bit 1 requests graphs. Verification always runs. */
    public static String compileSelected(String encodedSource, int outputs) {
        reportProgress = (outputs & 2) != 0;
        try {
            return compile(encodedSource, outputs);
        } finally {
            reportProgress = false;
        }
    }

    public static String compile(String encodedSource) {
        return compile(encodedSource, 3);
    }

    private static String compile(String encodedSource, int outputs) {
        String source = new String(
            Base64.getDecoder().decode(encodedSource),
            StandardCharsets.UTF_8
        );
        diagnostics.clear();
        progress("parse", "", "", 0, 0);
        tokyo.peya.langjal.compiler.member.InstructionSources.clear();
        String className = "";
        String encoded = "";
        List<String> stackFrames = new ArrayList<>();
        List<String> graphs = new ArrayList<>();
        try {
            String expanded = JALPreprocessor.preprocess(source);
            // Catch lexer errors too: the upstream parser's error strategy handles parser errors only.
            JALLexer lexer = new JALLexer(CharStreams.fromString(expanded));
            BaseErrorListener errors = new BaseErrorListener() {
                public void syntaxError(
                    Recognizer<?, ?> r,
                    Object token,
                    int line,
                    int column,
                    String message,
                    RecognitionException e
                ) {
                    add(
                        "error",
                        message,
                        line,
                        column,
                        token instanceof Token t
                            ? Math.max(1, t.getStopIndex() - t.getStartIndex() + 1)
                            : 1
                    );
                }
            };
            lexer.removeErrorListeners();
            lexer.addErrorListener(errors);
            CommonTokenStream tokens = new CommonTokenStream(lexer);
            tokens.fill();
            for (Token token : tokens.getTokens())
                if (token.getType() == JALLexer.ERRCHAR) add(
                    "error",
                    "Unexpected character: " + token.getText(),
                    token.getLine(),
                    token.getCharPositionInLine(),
                    1
                );
            JALParser.RootContext tree = SourceParser.parse(
                tokens,
                errors,
                diagnostics.isEmpty(),
                reportProgress
                    ? (completed, total) -> progress("parse", "", "", completed, total)
                    : null
            );
            if (tree.classDefinition() == null || tree.classDefinition().className() == null) add(
                "error",
                "クラス宣言が必要です。",
                1,
                0,
                1
            );
            else {
                List<Diagnostic> syntaxErrors = List.copyOf(diagnostics);
                JALClassCompiler compiled = new JALClassCompiler(
                    new FileEvaluatingReporter(REPORTER, null),
                    null,
                    CompileSettings.FULL
                );
                String owner = tree.classDefinition().className().getText();
                int total = (int) tree
                    .classDefinition()
                    .classBody()
                    .classBodyItem()
                    .stream()
                    .filter(item -> item.methodDefinition() != null)
                    .count();
                int[] completed = { 0 };
                compiled.setMethodListener((method, finished) -> {
                    if (finished) completed[0]++;
                    methodProgress(
                        "analysis",
                        owner,
                        method.methodName().getText() + method.methodDescriptor().getText(),
                        completed[0],
                        total,
                        finished,
                        null
                    );
                });
                compiled.setMethodRecovery(
                    method ->
                        method.stop != null &&
                        syntaxErrors
                            .stream()
                            .noneMatch(
                                d ->
                                    d.line() >= method.start.getLine() &&
                                    d.line() <= method.stop.getLine()
                            ),
                    (method, error) -> {
                        if (error instanceof CompileErrorException compile) compileError(compile);
                        else add(
                            "error",
                            error.getMessage() == null ? error.toString() : error.getMessage(),
                            method.start.getLine(),
                            method.start.getCharPositionInLine(),
                            1
                        );
                    }
                );
                compiled.compileClassAST(tree.classDefinition());
                progress("analysis", owner, "", total, total);
                ClassNode node = compiled.getCompiledClass();
                if (
                    tree.classDefinition().classMeta() == null ||
                    tree
                        .classDefinition()
                        .classMeta()
                        .classMetaItem()
                        .stream()
                        .noneMatch(item -> item.classPropMajor() != null)
                ) node.version = 67;
                // ASM verifies stack categories, locals, returns and control-flow merges as a second pass.
                int frameTotal = (int) node.methods
                        .stream()
                        .filter(m -> (m.access & (Opcodes.ACC_ABSTRACT | Opcodes.ACC_NATIVE)) == 0)
                        .count(),
                    frameCompleted = 0;
                for (MethodNode method : node.methods) {
                    if (
                        (method.access & (Opcodes.ACC_ABSTRACT | Opcodes.ACC_NATIVE)) != 0
                    ) continue;
                    progress(
                        "frames",
                        owner,
                        method.name + method.desc,
                        frameCompleted++,
                        frameTotal
                    );
                    if (method.tryCatchBlocks == null) method.tryCatchBlocks = new ArrayList<>();
                    // ASM's tree analyzer uses the logical jump opcode; widths belong to encoding.
                    java.util.Map<JumpInsnNode, Integer> wideJumps =
                        new java.util.IdentityHashMap<>();
                    for (AbstractInsnNode insn : method.instructions)
                        if (
                            insn instanceof JumpInsnNode jump &&
                            (jump.getOpcode() == 200 || jump.getOpcode() == 201)
                        ) {
                            wideJumps.put(jump, jump.getOpcode());
                            jump.setOpcode(jump.getOpcode() == 200 ? Opcodes.GOTO : Opcodes.JSR);
                        }
                    try {
                        BasicVerifier verifier = new StackFrames.Verifier();
                        Frame<BasicValue>[] frames = new Analyzer<>(verifier).analyzeAndComputeMaxs(
                            node.name,
                            method
                        );
                        if ((outputs & 1) != 0) StackFrames.append(
                            stackFrames,
                            method,
                            frames,
                            verifier
                        );
                        String graph =
                            (outputs & 2) != 0
                                ? InstructionGraph.compute(node.name, method, frames)
                                : null;
                        if (graph != null) graphs.add(graph);
                        methodProgress(
                            "frames",
                            owner,
                            method.name + method.desc,
                            frameCompleted,
                            frameTotal,
                            true,
                            graph
                        );
                    } catch (AnalyzerException e) {
                        int line = 1;
                        for (
                            AbstractInsnNode insn = method.instructions.getFirst();
                            insn != null;
                            insn = insn.getNext()
                        ) {
                            if (insn instanceof LineNumberNode n) line = n.line;
                            if (insn == e.node) break;
                        }
                        StackDiagnostics.Range range = StackDiagnostics.opcode(e.node, line);
                        add(
                            "error",
                            method.name + ": " + e.getMessage(),
                            range.line(),
                            range.column(),
                            range.length()
                        );
                    } finally {
                        wideJumps.forEach((jump, opcode) -> jump.setOpcode(opcode));
                    }
                }
                progress("frames", owner, "", frameTotal, frameTotal);
                if (node.version > 67) add(
                    "error",
                    "This runtime supports class file versions up to 67 (Java 23).",
                    1,
                    0,
                    1
                );
                if (diagnostics.stream().noneMatch(d -> d.severity().equals("error"))) {
                    ClassWriter writer = new ClassWriter(0);
                    node.accept(writer);
                    className = node.name;
                    encoded = Base64.getEncoder().encodeToString(writer.toByteArray());
                }
            }
        } catch (CompileErrorException e) {
            if (diagnostics.isEmpty()) compileError(e);
        } catch (Throwable e) {
            add("error", e.toString(), 1, 0, 1);
        }
        tokyo.peya.langjal.compiler.member.InstructionSources.clear();
        return (
            "{\"className\":" +
            quote(className) +
            ",\"bytecode\":" +
            quote(encoded) +
            ",\"diagnostics\":" +
            diagnosticJson() +
            ",\"stackFrames\":[" +
            String.join(",", stackFrames) +
            "],\"graphs\":[" +
            String.join(",", graphs) +
            "]}"
        );
    }

    private static class ProgramLoader extends ClassLoader {

        final java.util.Map<String, byte[]> classes = new java.util.HashMap<>();

        ProgramLoader(String manifest) {
            super(Bridge.class.getClassLoader());
            for (String row : manifest.split("\n")) {
                String[] parts = row.split("\t", 2);
                if (parts.length != 2) throw new IllegalArgumentException("Invalid class manifest");
                String name = parts[0].replace('/', '.');
                if (name.startsWith("java.")) throw new IllegalArgumentException(
                    "Cannot define java.* classes"
                );
                if (
                    classes.putIfAbsent(name, Base64.getDecoder().decode(parts[1])) != null
                ) throw new IllegalArgumentException("Duplicate class: " + name);
            }
        }

        @Override
        protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            synchronized (getClassLoadingLock(name)) {
                Class<?> result = findLoadedClass(name);
                if (result == null) {
                    byte[] bytes = classes.get(name);
                    result =
                        bytes == null
                            ? super.loadClass(name, false)
                            : defineClass(name, bytes, 0, bytes.length);
                }
                if (resolve) resolveClass(result);
                return result;
            }
        }
    }

    public static void runCompiled(String name, String base64, String stdin) throws Throwable {
        runProject(name, name + "\t" + base64, stdin);
    }

    public static void runProject(String name, String manifest, String stdin) throws Throwable {
        System.setIn(new ByteArrayInputStream(Base64.getDecoder().decode(stdin)));
        ProgramLoader loader = new ProgramLoader(manifest);
        String binaryName = name.replace('/', '.');
        if (!loader.classes.containsKey(binaryName)) throw new IllegalArgumentException(
            "Entry class not found"
        );
        byte[] entryBytes = loader.classes.get(binaryName);
        ClassNode entry = new ClassNode();
        new ClassReader(entryBytes).accept(entry, 0);
        if (
            (entry.access & (Opcodes.ACC_INTERFACE | Opcodes.ACC_ABSTRACT)) == 0 &&
            entry.methods.stream().noneMatch(m -> m.name.equals("<init>"))
        ) {
            MethodNode constructor = new MethodNode(
                Opcodes.ACC_PUBLIC,
                "<init>",
                "()V",
                null,
                null
            );
            constructor.visitVarInsn(Opcodes.ALOAD, 0);
            constructor.visitMethodInsn(
                Opcodes.INVOKESPECIAL,
                entry.superName,
                "<init>",
                "()V",
                false
            );
            constructor.visitInsn(Opcodes.RETURN);
            constructor.visitMaxs(1, 1);
            entry.methods.add(constructor);
            ClassWriter writer = new ClassWriter(0);
            entry.accept(writer);
            loader.classes.put(binaryName, writer.toByteArray());
        }
        Thread.currentThread().setContextClassLoader(loader);
        Class<?> main = Class.forName(binaryName, true, loader);
        java.lang.reflect.Method method = null;
        // Prefer String[] when both signatures exist, independently of staticness.
        for (Class<?>[] parameters : new Class<?>[][] { { String[].class }, {} }) {
            for (Class<?> owner = main; owner != null; owner = owner.getSuperclass()) {
                try {
                    var candidate = owner.getDeclaredMethod("main", parameters);
                    if (
                        candidate.getReturnType() == void.class &&
                        !java.lang.reflect.Modifier.isPrivate(candidate.getModifiers())
                    ) {
                        method = candidate;
                        break;
                    }
                } catch (NoSuchMethodException ignored) {}
            }
            if (method != null) break;
        }
        if (method == null) throw new IllegalArgumentException(
            "Entry method must be a non-private main([Ljava/lang/String;)V or main()V"
        );
        try {
            method.setAccessible(true);
            Object receiver = null;
            if (!java.lang.reflect.Modifier.isStatic(method.getModifiers())) {
                var constructor = main.getDeclaredConstructor();
                constructor.setAccessible(true);
                receiver = constructor.newInstance();
            }
            method.invoke(
                receiver,
                method.getParameterCount() == 0 ? new Object[0] : new Object[] { new String[0] }
            );
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }

    public static void main(String[] args) throws Throwable {
        System.out.println(
            compile(Base64.getEncoder().encodeToString(readBytes(Path.of(args[0]))))
        );
    }
}
