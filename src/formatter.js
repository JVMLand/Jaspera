import { parseJal } from './jal-parse.js';
import antlr4 from 'antlr4';
import JALLexer from './generated/offset-parser/JALLexer.js';
import JALParser from './generated/offset-parser/JALParser.js';

// Change only gaps between original tokens. In particular, never rebuild literals or macros.
export function formatJal(source, { tabSize = 2, insertSpaces = true } = {}) {
  if (source.length > 1024 * 1024) return source;
  const eol = source.includes('\r\n') ? '\r\n' : '\n',
    unit = insertSpaces ? ' '.repeat(Math.max(1, Math.min(16, tabSize))) : '\t';
  try {
    const scan = new JALLexer(new antlr4.InputStream(source));
    scan.removeErrorListeners();
    const original = new antlr4.CommonTokenStream(scan);
    original.fill();
    const directiveLines = new Set(
      original.tokens
        .filter(
          (t) =>
            t.text === '#' &&
            /^[ \t]*$/.test(source.slice(source.lastIndexOf('\n', t.start - 1) + 1, t.start)),
        )
        .map((t) => t.line),
    );
    const directives = [];
    let offset = 0,
      continued = false;
    const masked = source
      .split(/(?<=\n)/)
      .map((line, index) => {
        const protect = continued || directiveLines.has(index + 1);
        continued = protect && /\\[ \t]*(?:\r?\n)?$/.test(line);
        if (protect) {
          const text = line.replace(/[\r\n]+$/, '');
          directives.push({
            start: offset,
            stop: offset + text.length - 1,
            text,
            type: -2,
            tokenIndex: -1,
          });
        }
        offset += line.length;
        return protect ? line.replace(/[^\r\n]/g, ' ') : line;
      })
      .join('');
    const { stream, errors, root } = parseJal(masked),
      invalid = errors.length > 0,
      starts = new Set(),
      labels = new Set(),
      labelEnds = new Set();
    const walk = (node) => {
      const rule = JALParser.ruleNames[node.ruleIndex];
      if (
        [
          'fieldDefinition',
          'methodDefinition',
          'instruction',
          'label',
          'jvmInsArgLookupSwitchCase',
        ].includes(rule) &&
        node.start?.tokenIndex >= 0
      )
        starts.add(node.start.start);
      if (rule === 'label' && node.start?.tokenIndex >= 0) {
        labels.add(node.start.start);
        labelEnds.add(node.stop?.stop);
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(root);
    const tokens = [
      ...stream.tokens.filter((t) => t.type !== -1 && t.type !== JALLexer.SPACE),
      ...directives,
    ].sort((a, b) => a.start - b.start);
    if (!tokens.length) return source.trim() ? source : '';
    let result = '',
      previous,
      depth = 0;
    const indent = (level) => unit.repeat(Math.max(0, level));
    const comment = (t) => t.type === JALLexer.LINE_COMMENT || t.type === JALLexer.BLOCK_COMMENT;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i],
        text = token.text,
        gap = source.slice(previous ? previous.stop + 1 : 0, token.start);
      if (token.type === -2) {
        result += gap + text;
        previous = token;
        continue;
      }
      const closing = text === '}',
        opening = text === '{' && token.channel === 0;
      if (closing) depth = Math.max(0, depth - 1);
      const label =
        labels.has(token.start) ||
        (invalid &&
          depth === 2 &&
          token.type === JALLexer.ID &&
          tokens[i + 1]?.text === ':' &&
          (/\n/.test(gap) || !previous));
      const level = label ? depth - 1 : depth;
      if (!previous) result += indent(level);
      else if (previous.type === -2) {
        result += gap.replace(/[^\r\n]*$/, indent(level));
      } else {
        const oldBreaks = (gap.match(/\n/g) ?? []).length;
        const boundary = !invalid && (starts.has(token.start) || labelEnds.has(previous.stop));
        const newline =
          oldBreaks > 0 ||
          previous.type === JALLexer.LINE_COMMENT ||
          (!invalid && (closing || previous.text === '{' || boundary));
        if (newline) result += eol.repeat(Math.max(1, Math.min(2, oldBreaks))) + indent(level);
        else if (invalid) result += gap;
        else if (comment(token) || comment(previous)) result += ' ';
        else if (
          ['->', ':', '/', '|', '~'].includes(text) ||
          ['->', ':', '/', '|', '~', '[', '('].includes(previous.text) ||
          [',', ']', ')'].includes(text) ||
          (token.type === JALLexer.METHOD_DESCRIPTOR &&
            (previous.type === JALLexer.ID ||
              previous.text === '<init>' ||
              previous.text === '<clinit>' ||
              previous.text.endsWith('|')))
        )
          result += '';
        else result += ' ';
      }
      result += text;
      if (opening) depth++;
      previous = token;
    }
    return result + eol;
  } catch {
    return source;
  }
}
