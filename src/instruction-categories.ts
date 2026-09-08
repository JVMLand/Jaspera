import { msg, displayText } from './messages.js';
import descriptions from '../vendor/javasm/completion-ja.json';
const types: Record<string, string> = {
  i: 'int',
  l: 'long',
  f: 'float',
  d: 'double',
  a: msg('m8fabe6bae6f1'),
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
      msg('m9bf67764bae7'),
      m[2] === 'load' ? msg('ma7010834da1d') : msg('ma3030bf8f16d'),
    );
  m = name.match(/^([ilfdabcs])a(load|store)$/);
  if (m)
    return join(
      types[m[1]],
      msg('m5ce5d6988481'),
      m[2] === 'load' ? msg('ma7010834da1d') : msg('ma3030bf8f16d'),
    );
  m = name.match(/^([ilfd])2([ilfdbcs])$/);
  if (m) return join(types[m[1]], msg('m2dea9a4af76d'), types[m[2]]);
  m = name.match(/^([ilfda])const_/);
  if (m) return join(types[m[1]], msg('m673af6892c3c'), msg('ma7010834da1d'));
  m = name.match(/^([ilfda])return$/);
  if (m) return join(types[m[1]], msg('m99942ce88f0b'), msg('mcd8e4c178488'));
  if (name === 'iinc') return join('int', msg('m9bf67764bae7'), msg('m5d3de4d0c8be'));
  if (/^if/.test(name))
    return join(
      /^if_a|^ifnull$|^ifnonnull$/.test(name) ? msg('m8fabe6bae6f1') : 'int',
      msg('md20b40cb516b'),
      msg('m18af961ec7df'),
    );
  if (/^(get|put)(static|field)$/.test(name))
    return join(
      name.endsWith('static') ? 'static' : msg('m54a70dcc8ee2'),
      msg('mdb132d621cb1'),
      name.startsWith('get') ? msg('ma7010834da1d') : msg('ma3030bf8f16d'),
    );
  const calls: Record<string, string> = {
    invokevirtual: msg('m1edfce8aed1e'),
    invokespecial: msg('mc32b61e9bdf8'),
    invokestatic: 'static',
    invokeinterface: msg('me331ba1d139f'),
    invokedynamic: msg('m539d29818d4b'),
  };
  if (calls[name]) return join(calls[name], msg('m99942ce88f0b'), msg('mc6cacd2fe5bb'));
  const special: Record<string, string[]> = {
    anewarray: [msg('m8fabe6bae6f1'), msg('m5ce5d6988481'), msg('m1ad1463fe16f')],
    newarray: [msg('m1d4d3b59b548'), msg('m5ce5d6988481'), msg('m1ad1463fe16f')],
    multianewarray: [msg('ma4f94efbf004'), msg('m5ce5d6988481'), msg('m1ad1463fe16f')],
    arraylength: [msg('m5ce5d6988481'), msg('mc4cd19575076'), msg('m03ecfee0d013')],
    new: [msg('m8fabe6bae6f1'), msg('ma312c68b0116'), msg('m1ad1463fe16f')],
    checkcast: [msg('m8fabe6bae6f1'), msg('m850e16d958ce'), msg('m769a9b4044c6')],
    instanceof: [msg('m8fabe6bae6f1'), msg('m850e16d958ce'), msg('m15c58df57646')],
    athrow: [msg('m8fabe6bae6f1'), msg('m794a49d55773'), msg('mc56364893fdd')],
    ldc: [msg('me41449619dfc'), msg('m673af6892c3c'), msg('ma7010834da1d')],
    ldc_w: [msg('me41449619dfc'), msg('m673af6892c3c'), msg('mb89bdbf7a2c1')],
    ldc2_w: ['long / double', msg('m673af6892c3c'), msg('ma7010834da1d')],
    bipush: ['int', msg('m673af6892c3c'), msg('mb1c2c2f4d28d')],
    sipush: ['int', msg('m673af6892c3c'), msg('md983b9b2a7a9')],
    monitorenter: [msg('m0ba8b412c1a3'), msg('m1780f8d0b5ca'), msg('m03ecfee0d013')],
    monitorexit: [msg('m0ba8b412c1a3'), msg('m1780f8d0b5ca'), msg('m85a81f88e312')],
    wide: [msg('m928f87d4507b'), msg('mce0b03a6451f'), msg('m93019658530e')],
    nop: [msg('md20b40cb516b'), msg('m46bb039204bd')],
    return: ['void', msg('m99942ce88f0b'), msg('m6077b8f63435')],
    tableswitch: ['int', msg('md20b40cb516b'), msg('m88a9be33b77d')],
    lookupswitch: ['int', msg('md20b40cb516b'), msg('mef510b7e5a2d')],
  };
  if (special[name]) return join(...special[name]);
  const description = (descriptions as Record<string, string>)[name];
  if (!description) return join(msg('m928f87d4507b'), name);
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
        ? msg('m60e3b1d6a149')
        : operation.startsWith('比較')
          ? msg('m2ddd4be2e164')
          : msg('m9255d7d3cbea'),
      operation,
    );
  return join(group, operation);
}
