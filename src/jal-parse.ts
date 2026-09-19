import antlr4, {
  BailErrorStrategy,
  PredictionMode,
  CharStream,
  ErrorListener,
  ParserRuleContext,
  type ParseTree,
  type Token,
} from 'antlr4';
import JALLexer from './generated/offset-parser/JALLexer.ts';
import JALParser from './generated/offset-parser/JALParser.ts';

// A snapshot is shared only for one analysis request, never retained across edits.
export function parseJal(source: string, fast = true) {
  // Editor offsets use UTF-16 code units, including inside supplementary characters.
  const lexer = new JALLexer(new CharStream(source, false));
  lexer.removeErrorListeners();
  const stream = new antlr4.CommonTokenStream(lexer);
  stream.fill();
  const errors = stream.tokens.filter((t) => t.type === JALLexer.ERRCHAR).map((t) => t.tokenIndex);
  // Try context-free prediction first; incomplete/ambiguous input falls back to
  // the original LL parser and its error recovery using the same lexer tokens.
  if (fast && errors.length === 0) {
    const quick = new JALParser(stream);
    quick.removeErrorListeners();
    quick._interp.predictionMode = PredictionMode.SLL;
    quick._errHandler = new BailErrorStrategy();
    try {
      return { stream, errors, root: quick.root() };
    } catch {
      /* BailErrorStrategy aborted; retry with full context and recovery. */
    }
    stream.seek(0);
  }
  const parser = new JALParser(stream);
  parser.removeErrorListeners();
  class SyntaxErrors extends ErrorListener<Token> {
    override syntaxError(_r: unknown, t: Token) {
      if (t) errors.push(t.tokenIndex);
    }
  }
  parser.addErrorListener(new SyntaxErrors());
  return { stream, errors, root: parser.root() };
}

export type JalParse = typeof parseJal;
export function ruleChildren(node: ParserRuleContext): ParserRuleContext[] {
  return (node.children ?? []).filter(
    (child): child is ParserRuleContext => child instanceof ParserRuleContext,
  );
}

/** Stop at matching contexts, preserving source order and excluding terminal tokens. */
export function collectRules<T extends ParserRuleContext>(
  node: ParseTree,
  context: new (...args: never[]) => T,
): T[] {
  if (node instanceof context) return [node];
  return node instanceof ParserRuleContext
    ? ruleChildren(node).flatMap((child) => collectRules(child, context))
    : [];
}
