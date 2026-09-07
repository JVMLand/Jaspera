package jalweb;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.net.URLClassLoader;
import java.lang.reflect.InvocationTargetException;
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
    public record Diagnostic(String severity, String message, long line, long column, long length) {}
    private static final List<Diagnostic> diagnostics = new ArrayList<>();
    private static void add(String severity,String message,long line,long column,long length) {
        if(diagnostics.size()>=100) return;
        Diagnostic d=new Diagnostic(severity,message,Math.max(1,line),Math.max(1,column+1),Math.max(1,length));
        if(!diagnostics.contains(d)) diagnostics.add(d);
    }
    private static void compileError(CompileErrorException e) {
        if(e instanceof InstructionAnalysisException analysis) {
            StackDiagnostics.Problem problem=StackDiagnostics.describe(analysis);
            StackDiagnostics.Range range=problem.range();
            add("error",problem.message(),range.line(),range.column(),range.length());
        } else add("error",e.getDetailedMessage(),e.getLine(),e.getColumn(),e.getLength());
    }
    private static final CompileReporter REPORTER = new CompileReporter() {
        public boolean isDebugEnabled() { return false; }
        public boolean isInfoEnabled() { return false; }
        public void postInfo(String m,Path p) {}
        public void postDebug(String m,Path p) {}
        public void postWarning(String m,Path p) { add("warning",m,1,0,1); }
        public void postWarning(String m,Path p,long l,long c,long n) { add("warning",m,l,c,n); }
        public void postWarning(String m,Path p,ParserRuleContext c) { add("warning",m,c.start.getLine(),c.start.getCharPositionInLine(),1); }
        public void postError(String m,Path p) { add("error",m,1,0,1); }
        public void postError(String m,CompileErrorException e,Path p) { compileError(e); }
    };
    public static String quote(String s) {
        StringBuilder b=new StringBuilder("\"");
        for(char c:s.toCharArray()) switch(c) {
            case '"' -> b.append("\\\""); case '\\' -> b.append("\\\\");
            case '\n' -> b.append("\\n"); case '\r' -> b.append("\\r"); case '\t' -> b.append("\\t");
            default -> { if(c<32||c>126) b.append("\\u").append("0123456789abcdef".charAt(c>>>12)).append("0123456789abcdef".charAt((c>>>8)&15)).append("0123456789abcdef".charAt((c>>>4)&15)).append("0123456789abcdef".charAt(c&15)); else b.append(c); }
        }
        return b.append('"').toString();
    }
    private static String diagnosticJson() {
        List<String> entries=new ArrayList<>();
        for(Diagnostic d:diagnostics) entries.add("{\"severity\":"+quote(d.severity())+",\"message\":"+quote(d.message())+",\"line\":"+d.line()+",\"column\":"+d.column()+",\"length\":"+d.length()+"}");
        return "["+String.join(",",entries)+"]";
    }
    private static byte[] readBytes(Path path) throws IOException {
        try(InputStream in=new FileInputStream(path.toFile())) { return in.readAllBytes(); }
    }
    public static String disassemble(String encoded) { return Disassembler.disassemble(encoded); }
    public static String compile(String encodedSource) {
        String source=new String(Base64.getDecoder().decode(encodedSource),StandardCharsets.UTF_8);
        diagnostics.clear();
        tokyo.peya.langjal.compiler.member.InstructionSources.clear();
        String className=""; String encoded=""; List<String> stackFrames=new ArrayList<>(); List<String> graphs=new ArrayList<>();
        try {
            String expanded=JALPreprocessor.preprocess(source);
            // Catch lexer errors too: the upstream parser's error strategy handles parser errors only.
            JALLexer lexer=new JALLexer(CharStreams.fromString(expanded));
            BaseErrorListener errors=new BaseErrorListener() {
                public void syntaxError(Recognizer<?,?> r,Object token,int line,int column,String message,RecognitionException e) {
                    add("error",message,line,column,token instanceof Token t ? Math.max(1,t.getStopIndex()-t.getStartIndex()+1):1);
                }
            };
            lexer.removeErrorListeners(); lexer.addErrorListener(errors);
            CommonTokenStream tokens=new CommonTokenStream(lexer);
            tokens.fill();
            for(Token token:tokens.getTokens()) if(token.getType()==JALLexer.ERRCHAR)
                add("error","Unexpected character: "+token.getText(),token.getLine(),token.getCharPositionInLine(),1);
            JALParser parser=new JALParser(tokens);
            parser.removeErrorListeners(); parser.addErrorListener(errors); JALParser.RootContext tree=parser.root();
            if(diagnostics.stream().noneMatch(d->d.severity().equals("error"))) {
                JALClassCompiler compiled=new JALClassCompiler(new FileEvaluatingReporter(REPORTER,null),null,CompileSettings.FULL);
                compiled.compileClassAST(tree.classDefinition());
                ClassNode node=compiled.getCompiledClass();
                // ASM verifies stack categories, locals, returns and control-flow merges as a second pass.
                for(MethodNode method:node.methods) {
                    if((method.access&(Opcodes.ACC_ABSTRACT|Opcodes.ACC_NATIVE))!=0) continue;
                    if(method.tryCatchBlocks==null) method.tryCatchBlocks=new ArrayList<>();
                    // ASM's tree analyzer uses the logical jump opcode; widths belong to encoding.
                    java.util.Map<JumpInsnNode,Integer> wideJumps=new java.util.IdentityHashMap<>();
                    for(AbstractInsnNode insn:method.instructions) if(insn instanceof JumpInsnNode jump && (jump.getOpcode()==200||jump.getOpcode()==201)) {
                        wideJumps.put(jump,jump.getOpcode()); jump.setOpcode(jump.getOpcode()==200?Opcodes.GOTO:Opcodes.JSR);
                    }
                    try {
                        BasicVerifier verifier=new StackFrames.Verifier();
                        Frame<BasicValue>[] frames=new Analyzer<>(verifier).analyzeAndComputeMaxs(node.name,method);
                        StackFrames.append(stackFrames,method,frames,verifier);
                        graphs.add(InstructionGraph.compute(node.name,method,frames));
                    }
                    catch(AnalyzerException e) {
                        int line=1;
                        for(AbstractInsnNode insn=method.instructions.getFirst();insn!=null;insn=insn.getNext()) {
                            if(insn instanceof LineNumberNode n) line=n.line;
                            if(insn==e.node) break;
                        }
                        StackDiagnostics.Range range=StackDiagnostics.opcode(e.node,line);
                        add("error",method.name+": "+e.getMessage(),range.line(),range.column(),range.length());
                    }
                    finally {wideJumps.forEach((jump,opcode)->jump.setOpcode(opcode));}
                }
                if(node.version>67) add("error","This runtime supports class file versions up to 67 (Java 23).",1,0,1);
                if(diagnostics.stream().noneMatch(d->d.severity().equals("error"))) {
                    ClassWriter writer=new ClassWriter(0); node.accept(writer);
                    className=node.name;
                    encoded=Base64.getEncoder().encodeToString(writer.toByteArray());
                }
            }
        } catch(CompileErrorException e) {
            if(diagnostics.isEmpty()) compileError(e);
        } catch(Throwable e) { add("error",e.toString(),1,0,1); }
        tokyo.peya.langjal.compiler.member.InstructionSources.clear();
        return "{\"className\":"+quote(className)+",\"bytecode\":"+quote(encoded)+",\"diagnostics\":"+diagnosticJson()+",\"stackFrames\":["+String.join(",",stackFrames)+"],\"graphs\":["+String.join(",",graphs)+"]}";
    }
    private static class ProgramLoader extends ClassLoader {
        final java.util.Map<String,byte[]> classes=new java.util.HashMap<>();
        ProgramLoader(String manifest) {
            super(Bridge.class.getClassLoader());
            for(String row:manifest.split("\n")) {
                String[] parts=row.split("\t",2);
                if(parts.length!=2)throw new IllegalArgumentException("Invalid class manifest");
                String name=parts[0].replace('/','.');
                if(name.startsWith("java."))throw new IllegalArgumentException("Cannot define java.* classes");
                if(classes.putIfAbsent(name,Base64.getDecoder().decode(parts[1]))!=null)
                    throw new IllegalArgumentException("Duplicate class: "+name);
            }
        }
        @Override protected Class<?> loadClass(String name,boolean resolve) throws ClassNotFoundException {
            synchronized(getClassLoadingLock(name)) {
                Class<?> result=findLoadedClass(name);
                if(result==null) {
                    byte[] bytes=classes.get(name);
                    result=bytes==null?super.loadClass(name,false):defineClass(name,bytes,0,bytes.length);
                }
                if(resolve)resolveClass(result);
                return result;
            }
        }
    }
    public static void runCompiled(String name,String base64,String stdin) throws Throwable {
        runProject(name,name+"\t"+base64,stdin);
    }
    public static void runProject(String name,String manifest,String stdin) throws Throwable {
        System.setIn(new ByteArrayInputStream(Base64.getDecoder().decode(stdin)));
        ProgramLoader loader=new ProgramLoader(manifest);
        String binaryName=name.replace('/','.');
        if(!loader.classes.containsKey(binaryName))throw new IllegalArgumentException("Entry class not found");
        Thread.currentThread().setContextClassLoader(loader);
        Class<?> main=Class.forName(binaryName,true,loader);
        var method=main.getMethod("main",String[].class);
        if(!java.lang.reflect.Modifier.isStatic(method.getModifiers())||method.getReturnType()!=void.class)
            throw new IllegalArgumentException("main must be public static main([Ljava/lang/String;)V");
        try { method.invoke(null,(Object)new String[0]); }
        catch(InvocationTargetException e) { throw e.getCause(); }
    }
    public static void main(String[] args) throws Throwable {
        System.out.println(compile(Base64.getEncoder().encodeToString(readBytes(Path.of(args[0])))));
    }
}
