import { msg } from './messages.js';
import { parseJal } from './jal-parse.js';
import JALParser from './generated/offset-parser/JALParser.js';

// Inspect original parser tokens, never expanded macros or recovered instructions.
// Token edits keep labels, whitespace and comments intact.
const integer = (text) => {
  if (!/^-?(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(text ?? '')) return undefined;
  const value = text.startsWith('-') ? -Number(text.slice(1)) : Number(text);
  return Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647
    ? value
    : undefined;
};
export function inspectSource(source, parse = parseJal) {
  if (source.length > 1024 * 1024) return [];
  const result = [];
  try {
    const { stream, errors, root } = parse(source);
    const collect = (node, rules) => {
      const out = [];
      const visit = (n) => {
        if (rules.includes(JALParser.ruleNames[n.ruleIndex])) {
          out.push(n);
          return;
        }
        for (const c of n.children ?? []) visit(c);
      };
      visit(node);
      return out;
    };
    for (const method of collect(root, ['methodDefinition'])) {
      const bad = Math.min(
        ...errors.filter(
          (i) => i >= method.start.tokenIndex && i <= (method.stop?.tokenIndex ?? Infinity),
        ),
      );
      const descriptor = method.methodDescriptor()?.getText() ?? '',
        returnType = descriptor.slice(descriptor.lastIndexOf(')') + 1);
      const expected = /^[ZBCSI]$/.test(returnType)
        ? 'ireturn'
        : ({ V: 'return', J: 'lreturn', F: 'freturn', D: 'dreturn' }[returnType] ??
          (/^[L[]/.test(returnType) ? 'areturn' : undefined));
      let terminated;
      for (const node of collect(method, ['instruction', 'label'])) {
        if (JALParser.ruleNames[node.ruleIndex] === 'label') {
          terminated = undefined;
          continue;
        }
        const from = node.start.tokenIndex,
          to = node.stop?.tokenIndex ?? from;
        if (to >= bad || node.exception || node.children?.[0]?.exception) break;
        const ts = stream.tokens.slice(from, to + 1).filter((t) => t.channel === 0);
        const wide = ts[0]?.text === 'wide',
          op = ts[wide ? 1 : 0],
          arg = ts[wide ? 2 : 1],
          name = op?.text;
        if (!op) continue;
        const edit = (token, text) => ({ start: token.start, end: token.stop + 1, text });
        const report = (code, message, severity = 'warning', title, edits) =>
          result.push({
            code,
            message,
            severity,
            start: node.start.start,
            end: node.stop.stop + 1,
            title,
            edits,
          });
        const replace = (replacement, removeArg = false) => [
          edit(op, replacement),
          ...(removeArg ? [edit(arg, '')] : []),
          ...(wide ? [edit(ts[0], '')] : []),
        ];
        if (terminated)
          report('unreachable', msg('execution.instructionsAfterAreUnreachable', [terminated]));
        if (/^(goto(?:_w)?|[ilfda]?return|athrow|tableswitch|lookupswitch)$/.test(name))
          terminated = name;
        if (/^[ilfda]?return$/.test(name) && expected && name !== expected)
          report(
            'return-type',
            msg('execution.returnTypeRequiresAlsoCheckTheStackType', [returnType, expected]),
            'error',
          );
        const value = integer(arg?.text);
        if (['bipush', 'sipush', 'ldc'].includes(name) && value !== undefined) {
          const replacement =
            value >= -1 && value <= 5
              ? 'iconst_' + (value === -1 ? 'm1' : value)
              : value >= -128 && value <= 127
                ? 'bipush'
                : value >= -32768 && value <= 32767
                  ? 'sipush'
                  : 'ldc';
          if (name !== replacement) {
            const overflow =
              (name === 'bipush' && (value < -128 || value > 127)) ||
              (name === 'sipush' && (value < -32768 || value > 32767));
            const short = replacement.startsWith('iconst_'),
              title = msg('execution.changeTo', [replacement, short ? '' : ' ' + arg.text]);
            report(
              overflow ? 'push-range' : 'short-push',
              overflow
                ? msg('execution.outOfRangeFor', [name, title])
                : msg('execution.aShorterInstructionIsAvailable', [title]),
              overflow ? 'error' : 'warning',
              title,
              replace(replacement, short),
            );
          }
        }
        if (/^(?:[ilfda](?:load|store)|ret|iinc)$/.test(name) && value !== undefined) {
          const increment = name === 'iinc' ? integer(ts[wide ? 3 : 2]?.text) : 0;
          if (value < 0 || value > 65534 || (/^[ld]/.test(name) && value > 65533)) {
            report(
              'local-range',
              msg('execution.localVariableIndexIsOutOfRangeForTwoSlot'),
              'error',
            );
            continue;
          }
          if (increment === undefined) continue;
          if (increment < -32768 || increment > 32767) {
            report('increment-range', msg('execution.theIincIncrementMustBeBetweenAnd'), 'error');
            continue;
          }
          const needsWide = value > 255 || increment < -128 || increment > 127;
          if (needsWide && !wide) {
            report(
              'missing-wide',
              msg('execution.thisLocalIndexOrIncrementRequiresWide'),
              'error',
              msg('execution.addWide'),
              [{ start: op.start, end: op.start, text: 'wide ' }],
            );
          } else if (value <= 3 && /^[ilfda](?:load|store)$/.test(name)) {
            const replacement = name + '_' + value;
            report(
              'short-local',
              msg('execution.theShortFormIsAvailable', [replacement]),
              'warning',
              replacement + msg('execution.useThisInstead'),
              replace(replacement, true),
            );
          } else if (wide && !needsWide)
            report(
              'extra-wide',
              msg('execution.thisInstructionDoesNotNeedWide'),
              'warning',
              msg('execution.removeUnnecessaryWide'),
              [edit(ts[0], '')],
            );
        }
      }
    }
  } catch {
    /* Incomplete source is handled by the compiler's syntax diagnostics. */
  }
  return result;
}
