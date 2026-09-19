import 'antlr4';

// ANTLR 4.13.2 implements seek() but omits it from BufferedTokenStream's types.
declare module 'antlr4' {
  interface BufferedTokenStream {
    seek(index: number): void;
  }
}
