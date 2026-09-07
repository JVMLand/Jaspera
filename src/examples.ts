export const hello = `public class Main {
  public static main([Ljava/lang/String;)V {
    // Hello, JVM!
    getstatic java/lang/System->out:Ljava/io/PrintStream;
    ldc "Hello, World!"
    invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V
    return
  }
}
`;
