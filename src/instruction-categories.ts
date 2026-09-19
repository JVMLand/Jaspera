import { msg, displayText } from './messages.ts';
import descriptions from '../vendor/javasm/completion-ja.json';
const types: Record<string, string> = {
  i: 'int',
  l: 'long',
  f: 'float',
  d: 'double',
  a: msg('instructions.referenceType'),
  b: 'byte / boolean',
  c: 'char',
  s: 'short',
};
const join = (...parts: string[]) => parts.reverse().map(displayText).join(' // ');
export function instructionCategory(name: string): string {
  let m = name.match(/^([ilfda])(load|store)(?:_[0-4])?$/);
  if (m)
    return join(
      types[m[1]],
      msg('common.locals'),
      m[2] === 'load' ? msg('instructions.load') : msg('common.save'),
    );
  m = name.match(/^([ilfdabcs])a(load|store)$/);
  if (m)
    return join(
      types[m[1]],
      msg('instructions.array'),
      m[2] === 'load' ? msg('instructions.load') : msg('common.save'),
    );
  m = name.match(/^([ilfd])2([ilfdbcs])$/);
  if (m) return join(types[m[1]], msg('instructions.typeConversion'), types[m[2]]);
  m = name.match(/^([ilfda])const_/);
  if (m) return join(types[m[1]], msg('common.constant'), msg('instructions.load'));
  m = name.match(/^([ilfda])return$/);
  if (m) return join(types[m[1]], msg('common.method'), msg('common.returnValue'));
  if (name === 'iinc') return join('int', msg('common.locals'), msg('instructions.addition'));
  if (/^if/.test(name))
    return join(
      /^if_a|^ifnull$|^ifnonnull$/.test(name) ? msg('instructions.referenceType') : 'int',
      msg('instructions.controlFlow'),
      msg('instructions.conditionalBranch'),
    );
  if (/^(get|put)(static|field)$/.test(name))
    return join(
      name.endsWith('static') ? 'static' : msg('instructions.instance'),
      msg('common.field'),
      name.startsWith('get') ? msg('instructions.load') : msg('common.save'),
    );
  const calls: Record<string, string> = {
    invokevirtual: msg('instructions.virtual'),
    invokespecial: msg('instructions.special'),
    invokestatic: 'static',
    invokeinterface: msg('instructions.interface'),
    invokedynamic: msg('instructions.dynamic'),
  };
  if (calls[name]) return join(calls[name], msg('common.method'), msg('instructions.call'));
  const special: Record<string, string[]> = {
    anewarray: [
      msg('instructions.referenceType'),
      msg('instructions.array'),
      msg('instructions.create'),
    ],
    newarray: [
      msg('instructions.primitiveType'),
      msg('instructions.array'),
      msg('instructions.create'),
    ],
    multianewarray: [
      msg('instructions.multidimensional'),
      msg('instructions.array'),
      msg('instructions.create'),
    ],
    arraylength: [msg('instructions.array'), msg('instructions.length'), msg('instructions.get')],
    new: [
      msg('instructions.referenceType'),
      msg('instructions.object'),
      msg('instructions.create'),
    ],
    checkcast: [
      msg('instructions.referenceType'),
      msg('instructions.type'),
      msg('instructions.cast'),
    ],
    instanceof: [
      msg('instructions.referenceType'),
      msg('instructions.type'),
      msg('instructions.test'),
    ],
    athrow: [
      msg('instructions.referenceType'),
      msg('instructions.exception'),
      msg('instructions.throw'),
    ],
    ldc: [msg('instructions.constantPool'), msg('common.constant'), msg('instructions.load')],
    ldc_w: [msg('instructions.constantPool'), msg('common.constant'), msg('instructions.loadWide')],
    ldc2_w: ['long / double', msg('common.constant'), msg('instructions.load')],
    bipush: ['int', msg('common.constant'), msg('instructions.bitImmediate')],
    sipush: ['int', msg('common.constant'), msg('instructions.bitImmediate2')],
    monitorenter: [
      msg('instructions.synchronization'),
      msg('instructions.monitor'),
      msg('instructions.get'),
    ],
    monitorexit: [
      msg('instructions.synchronization'),
      msg('instructions.monitor'),
      msg('instructions.release'),
    ],
    wide: [
      msg('instructions.instruction'),
      msg('instructions.operand'),
      msg('instructions.extend'),
    ],
    nop: [msg('instructions.controlFlow'), msg('instructions.noOperation')],
    return: ['void', msg('common.method'), msg('instructions.return')],
    tableswitch: ['int', msg('instructions.controlFlow'), msg('instructions.tableSwitch')],
    lookupswitch: ['int', msg('instructions.controlFlow'), msg('instructions.lookupSwitch')],
  };
  if (special[name]) return join(...special[name]);
  const description = (descriptions as Record<string, string>)[name];
  if (!description) return join(msg('instructions.instruction'), name);
  const [group, ...rest] = description.split(': '),
    operation = rest.join(': ');
  const type: Record<string, string> = {
    Integer: 'int',
    Long: 'long',
    Float: 'float',
    Double: 'double',
    Byte: 'byte',
    Short: 'short',
    Char: 'char',
  };
  if (type[group])
    return join(
      type[group],
      /^(?:ビット|.*シフト)/.test(operation)
        ? msg('instructions.bitwiseOperations')
        : operation.startsWith('比較')
          ? msg('instructions.comparison')
          : msg('instructions.arithmetic'),
      operation,
    );
  return join(group, operation);
}
