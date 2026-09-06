package jalweb;
import java.nio.file.*;
import java.util.zip.*;
import org.objectweb.asm.*;
/** Minimal adaptations of native entry points to the browser filesystem. */
public final class PatchRuntime {
 public static void main(String[] args)throws Exception {
  try(ZipFile jar=new ZipFile(args[0])) {
   String name="java/io/FileInputStream";
   ClassReader reader=new ClassReader(jar.getInputStream(jar.getEntry(name+".class")));
   ClassWriter writer=new ClassWriter(0);
   reader.accept(new ClassVisitor(Opcodes.ASM9,writer){
    public MethodVisitor visitMethod(int access,String method,String desc,String signature,String[] exceptions){
     if(!method.equals("available0")||!desc.equals("()I"))return super.visitMethod(access,method,desc,signature,exceptions);
     MethodVisitor mv=super.visitMethod(access&~Opcodes.ACC_NATIVE,method,desc,signature,exceptions);
     mv.visitCode();mv.visitVarInsn(Opcodes.ALOAD,0);mv.visitFieldInsn(Opcodes.GETFIELD,name,"closed","Z");
     Label open=new Label();mv.visitJumpInsn(Opcodes.IFEQ,open);
     mv.visitTypeInsn(Opcodes.NEW,"java/io/IOException");mv.visitInsn(Opcodes.DUP);mv.visitLdcInsn("Stream closed");
     mv.visitMethodInsn(Opcodes.INVOKESPECIAL,"java/io/IOException","<init>","(Ljava/lang/String;)V",false);mv.visitInsn(Opcodes.ATHROW);
     mv.visitLabel(open);mv.visitFrame(Opcodes.F_SAME,0,null,0,null);
     // InputStream.available is an estimate; zero is valid when the host has no ioctl/FIONREAD.
     mv.visitInsn(Opcodes.ICONST_0);mv.visitInsn(Opcodes.IRETURN);mv.visitMaxs(3,1);mv.visitEnd();return null;
    }
   },0);
   Path output=Path.of(args[1],name+".class");Files.createDirectories(output.getParent());Files.write(output,writer.toByteArray());
  }
 }
}
