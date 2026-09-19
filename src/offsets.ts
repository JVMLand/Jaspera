export interface SourceOffset {
  line: number;
  offset: number;
  method: string;
}

import { parseJal, collectRules, ruleChildren } from './jal-parse.ts';
import {
  MethodDefinitionContext,
  InstructionContext,
  JvmInsArgTableSwitchContext,
  JvmInsArgLookupSwitchContext,
} from './generated/offset-parser/JALParser.ts';
import sizes from './generated/offset-sizes.json';

// Mirrors Javasm's InstructionOffsetCalculator: sum source instruction sizes per method.
// No compiler, constant pool, class file or JVM is involved.
function preprocess(source: string) {
  if (!/^\s*#/m.test(source))
    return { source, mapping: source.split(/\r\n|\r|\n/).map((_, i) => i + 1) };
  const macros = new Map<string, string>(),
    mapping: number[] = [],
    output: string[] = [];
  let block = false;
  const expand = (text: string, depth = 0): string => {
    if (depth > 16) throw new Error('Macro recursion');
    return text.replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_$][\w$]*\b/g,
      (token: string) => (macros.has(token) ? expand(macros.get(token)!, depth + 1) : token),
    );
  };
  const lines = source.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const original = i + 1;
    let line = lines[i];
    if (!block && /^\s*#/.test(line)) {
      let count = 1;
      while (/\\\s*$/.test(line) && i + 1 < lines.length) {
        line = line.replace(/\\\s*$/, '') + '\n' + lines[++i];
        count++;
      }
      const def = line.match(/^\s*#define\s+([\w$]+)([\s\S]*)$/),
        undef = line.match(/^\s*#undef\s+(\w+)/);
      if (def && !def[2].startsWith('(')) macros.set(def[1], def[2].trim());
      if (undef) macros.delete(undef[1]);
      for (let j = 0; j < count; j++) {
        output.push('');
        mapping.push(original + j);
      }
      continue;
    }
    // Keep comments opaque, including block comments crossing source lines.
    let expanded = '';
    for (let at = 0; at < line.length;) {
      if (block) {
        const end = line.indexOf('*/', at);
        if (end < 0) {
          expanded += line.slice(at);
          break;
        }
        expanded += line.slice(at, end + 2);
        at = end + 2;
        block = false;
        continue;
      }
      const rest = line.slice(at),
        match = rest.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/|\/\*/);
      if (!match) {
        expanded += expand(rest);
        break;
      }
      expanded += expand(rest.slice(0, match.index));
      at += match.index!;
      if (match[0] === '//') {
        expanded += line.slice(at);
        break;
      }
      if (match[0] === '/*') {
        expanded += '/*';
        at += 2;
        block = true;
      } else {
        expanded += match[0];
        at += match[0].length;
      }
    }
    for (const part of expanded.split('\n')) {
      output.push(part);
      mapping.push(original);
    }
    if (output.length > 100000) throw new Error('Expanded source too large');
  }
  return { source: output.join('\n'), mapping };
}
export function calculateOffsets(source: string, parse = parseJal): SourceOffset[] {
  if (source.length > 1024 * 1024) return [];
  try {
    const expanded = preprocess(source);
    if (expanded.source.length > 2 * 1024 * 1024) return [];
    const { stream: tokens, errors, root } = parse(expanded.source),
      result: SourceOffset[] = [];
    for (const method of collectRules(root, MethodDefinitionContext)) {
      let offset = 0;
      const start = method.start.tokenIndex,
        end = method.stop?.tokenIndex ?? Infinity;
      const bad = Math.min(...errors.filter((i) => i >= start && i <= end));
      for (const instruction of collectRules(method, InstructionContext)) {
        const variant = ruleChildren(instruction)[0];
        if (!variant) break;
        const from = instruction.start.tokenIndex,
          to = instruction.stop?.tokenIndex ?? from;
        if (from >= bad) break;
        const ts = tokens.tokens.slice(from, to + 1).filter((t) => t.channel === 0),
          wide = ts[0]?.text === 'wide',
          name = ts[wide ? 1 : 0]?.text;
        const line = expanded.mapping[instruction.start.line - 1];
        if (line)
          result.push({
            line,
            offset,
            method: method.methodName().getText() + method.methodDescriptor().getText(),
          });
        if (to >= bad || instruction.exception || variant.exception) break;
        let size = (sizes as Record<string, number>)[name];
        if (name === 'tableswitch') {
          const arg = collectRules(variant, JvmInsArgTableSwitchContext)[0],
            labels = arg.jvmInsArgTableSwitchCaseList().labelName_list();
          size = 1 + ((4 - ((offset + 1) % 4)) % 4) + 12 + 4 * labels.length;
        } else if (name === 'lookupswitch') {
          const cases = collectRules(variant, JvmInsArgLookupSwitchContext)[0]
            .jvmInsArgLookupSwitchCaseList()
            .jvmInsArgLookupSwitchCase_list();
          size =
            1 +
            ((4 - ((offset + 1) % 4)) % 4) +
            8 +
            8 *
              cases.filter((c) => c.jvmInsArgLookupSwitchCaseName().getText() !== 'default').length;
        } else if (wide) size *= 2;
        if (!Number.isFinite(size)) break;
        offset += size;
      }
    }
    return result;
  } catch {
    return [];
  }
}
