package jalweb;
import java.util.*;
import java.util.zip.*;
import java.nio.file.*;
import org.objectweb.asm.*;
/** Generate completion metadata directly from the bundled OpenJDK, without loading classes. */
public final class Catalog {
    public static void main(String[] args) throws Exception {
        TreeMap<String,List<String>> classes=new TreeMap<>();
        try(ZipFile jar=new ZipFile(args[0])) {
            var entries=jar.entries();
            while(entries.hasMoreElements()) {
                var entry=entries.nextElement();
                if(!entry.getName().startsWith("java/")||!entry.getName().endsWith(".class")||entry.getName().contains("$"))continue;
                new ClassReader(jar.getInputStream(entry)).accept(new ClassVisitor(Opcodes.ASM9) {
                    String name; boolean visible; List<String> members=new ArrayList<>();
                    public void visit(int v,int access,String n,String signature,String superName,String[] interfaces) {
                        name=n;visible=(access&Opcodes.ACC_PUBLIC)!=0;
                    }
                    public FieldVisitor visitField(int access,String n,String d,String signature,Object value) {
                        if((access&Opcodes.ACC_PUBLIC)!=0) members.add("{\"name\":"+Bridge.quote(n+":"+d)+",\"kind\":\"field\",\"static\":"+((access&Opcodes.ACC_STATIC)!=0)+"}");
                        return null;
                    }
                    public MethodVisitor visitMethod(int access,String n,String d,String signature,String[] exceptions) {
                        if((access&Opcodes.ACC_PUBLIC)!=0&&(access&Opcodes.ACC_SYNTHETIC)==0&&!n.equals("<clinit>"))
                            members.add("{\"name\":"+Bridge.quote(n+d)+",\"kind\":\"method\",\"static\":"+((access&Opcodes.ACC_STATIC)!=0)+"}");
                        return null;
                    }
                    public void visitEnd() { if(visible) classes.put(name,members); }
                },ClassReader.SKIP_CODE|ClassReader.SKIP_DEBUG|ClassReader.SKIP_FRAMES);
            }
        }
        List<String> json=new ArrayList<>();
        for(var entry:classes.entrySet())json.add(Bridge.quote(entry.getKey())+":["+String.join(",",entry.getValue())+"]");
        Files.writeString(Path.of(args[1]),"{"+String.join(",",json)+"}");
        System.out.println("Generated OpenJDK completion catalog: "+classes.size()+" public classes");
    }
}
