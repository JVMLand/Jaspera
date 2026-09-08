import { msg } from './messages.js';
import type { DebugFrame } from './debug-protocol';
import type { FrameTransition } from './frame-transition';
/** Pure preview: never resumes the VM or calls a Java method. Values are logical JVM values (category 2 is one entry). */
export function predictDebugFrame(frame: DebugFrame): FrameTransition {
  const before = [...frame.stack],
    localsBefore = [...frame.locals],
    localsAfter = [...frame.locals];
  const result: FrameTransition = {
    before,
    after: [...before],
    consumed: 0,
    produced: 0,
    beforeLabel: msg('m83aeddd37528'),
    afterLabel: msg('m194f0b1f2a46'),
    limit: 65536,
  };
  if (localsBefore.length)
    result.locals = { before: localsBefore, after: [...localsBefore], changed: [] };
  const insn = frame.instruction;
  if (!insn) {
    result.terminal = msg('mcd5b4a83053f');
    return result;
  }
  const op = insn.opcode
    .toLowerCase()
    .replace(/_resolved$/, '')
    .replace(/^(getfield|putfield|getstatic|putstatic)_[bcsijfdzl]$/, '$1');
  const unknown = (label: string) => label + msg('m93c4b2742fe7');
  const fieldType = () => {
    const match = insn.fieldDescriptor?.match(/^(\[*)(?:L([^;]+);|([ZBCSIJFD]))$/);
    if (!match) return unknown(msg('m3e9743156256'));
    const primitives: Record<string, string> = {
      Z: 'boolean',
      B: 'byte',
      C: 'char',
      S: 'short',
      I: 'int',
      J: 'long',
      F: 'float',
      D: 'double',
    };
    return (match[2] ?? primitives[match[3]]) + '[]'.repeat(match[1].length);
  };
  const replace = (count: number, values: string[]) => {
    if (count > before.length) throw Error(msg('mf87dce3571c8'));
    result.consumed = count;
    result.produced = values.length;
    result.after = [...before.slice(0, before.length - count), ...values];
  };
  const top = () => before.at(-1)!;
  const local = () => {
    if (insn.local < 0) throw Error(msg('m25af7eac5f09'));
    return insn.local;
  };
  const terminal = (text: string) => {
    result.terminal = text;
    result.after = [];
  };
  const numeric = (v: string) => Number(v.replace(/[fFdD]$/, ''));
  try {
    if (/^[ilfda]load$/.test(op)) {
      replace(0, [localsBefore[local()] ?? unknown(msg('m9bf67764bae7'))]);
    } else if (/^[ilfda]store$/.test(op)) {
      localsAfter[local()] = top();
      replace(1, []);
    } else if (op === 'iinc') {
      const index = local();
      localsAfter[index] = String((Number(localsBefore[index]) + insn.increment) | 0);
    } else if (/^[ilfda]const$/.test(op) || op === 'aconst_null' || op === 'ldc') {
      replace(0, [insn.constant ?? unknown(msg('m673af6892c3c'))]);
    } else if (op.startsWith('invoke')) {
      if (insn.arguments < 0) throw Error(msg('mcb9fe228d1f4'));
      replace(insn.arguments, insn.returns ? [unknown(msg('mcd8e4c178488'))] : []);
    } else if (op === 'return' || /^[ilfda]return$/.test(op)) {
      replace(op === 'return' ? 0 : 1, []);
      terminal(msg('m6ff9abc732ee'));
    } else if (op === 'athrow') {
      replace(1, []);
      terminal(msg('m5d0bf5d23080'));
    } else if (op === 'getstatic') {
      replace(0, [fieldType()]);
    } else if (op === 'getfield') {
      replace(1, [fieldType()]);
      if (top() === 'null') terminal('NullPointerException');
    } else if (op === 'putstatic') {
      replace(1, []);
    } else if (op === 'putfield') {
      replace(2, []);
      if (before.at(-2) === 'null') terminal('NullPointerException');
    } else if (/^[ilfdabcs]aload$/.test(op)) {
      replace(2, [unknown(msg('mb1b65da3c3a8'))]);
      if (before.at(-2) === 'null') terminal('NullPointerException');
    } else if (/^[ilfdabcs]astore$/.test(op)) {
      replace(3, []);
      if (before.at(-3) === 'null') terminal('NullPointerException');
    } else if (op === 'arraylength') {
      replace(1, [unknown(msg('mf26688b57fd6'))]);
      if (top() === 'null') terminal('NullPointerException');
    } else if (op === 'new') {
      replace(0, [msg('m68c68242c66e')]);
    } else if (['newarray', 'anewarray', 'multianewarray'].includes(op)) {
      replace(op === 'multianewarray' ? insn.dimensions : 1, [msg('me87f077ee96b')]);
    } else if (op === 'instanceof') {
      replace(1, [top() === 'null' ? '0' : unknown(msg('m405fabd13ff8'))]);
    } else if (op === 'checkcast') {
      result.note = msg('mcaaa6f58f63f');
    } else if (op.startsWith('monitor')) {
      replace(1, []);
      if (top() === 'null') terminal('NullPointerException');
    } else if (op.startsWith('if')) {
      replace(op.includes('cmp') ? 2 : 1, []);
    } else if (op.endsWith('switch')) {
      replace(1, []);
    } else if (['nop', 'goto', 'ret'].includes(op)) {
    } else if (op === 'jsr') {
      replace(0, [unknown(msg('m4122fa922cdc'))]);
    } else if (op === 'pop' || op === 'pop2') {
      replace(op === 'pop' ? 1 : 2, []);
    } else if (op === 'swap') {
      replace(2, [top(), before.at(-2)!]);
    } else if (op.startsWith('dup')) {
      const patterns: Record<string, [number, number[]]> = {
        dup: [1, [0, 0]],
        dup_x1: [2, [1, 0, 1]],
        dup_x2: [3, [2, 0, 1, 2]],
        dup2: [2, [0, 1, 0, 1]],
        dup2_x1: [3, [1, 2, 0, 1, 2]],
        dup2_x2: [4, [2, 3, 0, 1, 2, 3]],
      };
      const [count, order] = patterns[op],
        values = before.slice(-count);
      replace(
        count,
        order.map((i) => values[i]),
      );
    } else if (/^[ilfd](add|sub|mul|div|rem|and|or|xor|shl|shr|ushr|neg)$/.test(op)) {
      const kind = op[0],
        operation = op.slice(1),
        unary = operation === 'neg',
        values = before.slice(unary ? -1 : -2);
      let value: string;
      if (kind === 'i' || kind === 'l') {
        const bits = kind === 'i' ? 32 : 64,
          a = BigInt(values[0].replace(/L$/i, '')),
          b = unary ? 0n : BigInt(values[1].replace(/L$/i, '')),
          shift = b & BigInt(bits - 1);
        let n: bigint;
        if ((operation === 'div' || operation === 'rem') && b === 0n) {
          replace(2, []);
          terminal('ArithmeticException');
          return result;
        }
        switch (operation) {
          case 'add':
            n = a + b;
            break;
          case 'sub':
            n = a - b;
            break;
          case 'mul':
            n = a * b;
            break;
          case 'div':
            n = a / b;
            break;
          case 'rem':
            n = a % b;
            break;
          case 'and':
            n = a & b;
            break;
          case 'or':
            n = a | b;
            break;
          case 'xor':
            n = a ^ b;
            break;
          case 'shl':
            n = a << shift;
            break;
          case 'shr':
            n = a >> shift;
            break;
          case 'ushr':
            n = BigInt.asUintN(bits, a) >> shift;
            break;
          default:
            n = -a;
        }
        value = BigInt.asIntN(bits, n).toString() + (kind === 'l' ? 'L' : '');
      } else {
        const a = numeric(values[0]),
          b = unary ? 0 : numeric(values[1]);
        let n =
          operation === 'add'
            ? a + b
            : operation === 'sub'
              ? a - b
              : operation === 'mul'
                ? a * b
                : operation === 'div'
                  ? a / b
                  : operation === 'rem'
                    ? a % b
                    : -a;
        if (kind === 'f') n = Math.fround(n);
        value = (Object.is(n, -0) ? '-0' : String(n)) + kind;
      }
      replace(unary ? 1 : 2, [value]);
    } else if (/^[lfd]cmp[gl]?$/.test(op)) {
      const a = op[0] === 'l' ? BigInt(before.at(-2)!.replace(/L$/i, '')) : numeric(before.at(-2)!),
        b = op[0] === 'l' ? BigInt(top().replace(/L$/i, '')) : numeric(top());
      replace(2, [
        String(
          Number.isNaN(a) || Number.isNaN(b)
            ? op.endsWith('l')
              ? -1
              : 1
            : a < b
              ? -1
              : a > b
                ? 1
                : 0,
        ),
      ]);
    } else if (/^[ilfd]2[ilfdbcs]$/.test(op)) {
      replace(1, [unknown(msg('md9b10bd56c77'))]);
    } else throw Error(msg('me9abc3e743ac'));
    const changed = Array.from(
      { length: Math.max(localsBefore.length, localsAfter.length) },
      (_, i) => i,
    ).filter((i) => localsBefore[i] !== localsAfter[i]);
    if (changed.length)
      result.locals = {
        before: changed.map((i) => localsBefore[i] ?? msg('m621330591694')),
        after: changed.map((i) => localsAfter[i] ?? msg('m621330591694')),
        labels: changed.map((i) => '#' + i),
        changed: changed.map((_, i) => i),
      };
  } catch {
    result.after = [];
    result.consumed = 0;
    result.produced = 0;
    result.terminal = msg('md655e5b8177c');
  }
  return result;
}
