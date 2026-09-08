package jalweb;

import java.util.function.BiConsumer;
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.atn.PredictionMode;
import org.antlr.v4.runtime.misc.ParseCancellationException;
import org.antlr.v4.runtime.tree.*;
import tokyo.peya.langjal.compiler.JALParser;

/** Fast prediction with the original full-context recovery for incomplete input. */
final class SourceParser {

    static JALParser.RootContext parse(
        CommonTokenStream tokens,
        BaseErrorListener errors,
        boolean validTokens,
        BiConsumer<Integer, Integer> progress
    ) {
        int total = Math.max(1, tokens.size() - 1);
        ParseTreeListener listener = new ParseTreeListener() {
            int reported;
            long last;

            public void visitTerminal(TerminalNode node) {}

            public void visitErrorNode(ErrorNode node) {}

            public void enterEveryRule(ParserRuleContext context) {}

            public void exitEveryRule(ParserRuleContext context) {
                if (
                    !(context instanceof JALParser.MethodDefinitionContext) || context.stop == null
                ) return;
                int completed = Math.min(total, context.stop.getTokenIndex() + 1);
                long now = System.nanoTime();
                if (completed > reported && now - last >= 100_000_000L) {
                    reported = completed;
                    last = now;
                    progress.accept(completed, total);
                }
            }
        };
        if (progress != null) progress.accept(0, total);
        if (validTokens) {
            JALParser quick = new JALParser(tokens);
            quick.removeErrorListeners();
            quick.getInterpreter().setPredictionMode(PredictionMode.SLL);
            quick.setErrorHandler(new BailErrorStrategy());
            if (progress != null) quick.addParseListener(listener);
            try {
                JALParser.RootContext root = quick.root();
                if (progress != null) progress.accept(total, total);
                return root;
            } catch (ParseCancellationException ignored) {
                tokens.seek(0);
            }
        }
        JALParser parser = new JALParser(tokens);
        parser.removeErrorListeners();
        parser.addErrorListener(errors);
        if (progress != null) parser.addParseListener(listener);
        JALParser.RootContext root = parser.root();
        if (progress != null) progress.accept(total, total);
        return root;
    }
}
