import descriptions from '../vendor/javasm/completion-ja.json';
const types: Record<string, string> = {
  i: 'int',
  l: 'long',
  f: 'float',
  d: 'double',
  a: '参照型',
  b: 'byte / boolean',
  c: 'char',
  s: 'short',
};
const join = (...parts: string[]) => parts.reverse().join(' // ');
export function instructionCategory(name: string): string {
  let m = name.match(/^([ilfda])(load|store)(?:_[0-4])?$/);
  if (m) return join(types[m[1]], 'ローカル変数', m[2] === 'load' ? '読み出し' : '保存');
  m = name.match(/^([ilfdabcs])a(load|store)$/);
  if (m) return join(types[m[1]], '配列', m[2] === 'load' ? '読み出し' : '保存');
  m = name.match(/^([ilfd])2([ilfdbcs])$/);
  if (m) return join(types[m[1]], '型変換', types[m[2]]);
  m = name.match(/^([ilfda])const_/);
  if (m) return join(types[m[1]], '定数', '読み出し');
  m = name.match(/^([ilfda])return$/);
  if (m) return join(types[m[1]], 'メソッド', '戻り値');
  if (name === 'iinc') return join('int', 'ローカル変数', '加算');
  if (/^if/.test(name))
    return join(
      /^if_a|^ifnull$|^ifnonnull$/.test(name) ? '参照型' : 'int',
      '制御フロー',
      '条件分岐',
    );
  if (/^(get|put)(static|field)$/.test(name))
    return join(
      name.endsWith('static') ? 'static' : 'インスタンス',
      'フィールド',
      name.startsWith('get') ? '読み出し' : '保存',
    );
  const calls: Record<string, string> = {
    invokevirtual: '仮想',
    invokespecial: '特殊',
    invokestatic: 'static',
    invokeinterface: 'インターフェース',
    invokedynamic: '動的',
  };
  if (calls[name]) return join(calls[name], 'メソッド', '呼び出し');
  const special: Record<string, string[]> = {
    anewarray: ['参照型', '配列', '生成'],
    newarray: ['プリミティブ型', '配列', '生成'],
    multianewarray: ['多次元', '配列', '生成'],
    arraylength: ['配列', '長さ', '取得'],
    new: ['参照型', 'オブジェクト', '生成'],
    checkcast: ['参照型', '型', 'キャスト'],
    instanceof: ['参照型', '型', '判定'],
    athrow: ['参照型', '例外', '送出'],
    ldc: ['定数プール', '定数', '読み出し'],
    ldc_w: ['定数プール', '定数', '読み出し (wide)'],
    ldc2_w: ['long / double', '定数', '読み出し'],
    bipush: ['int', '定数', '8 bit 即値'],
    sipush: ['int', '定数', '16 bit 即値'],
    monitorenter: ['同期', 'モニター', '取得'],
    monitorexit: ['同期', 'モニター', '解放'],
    wide: ['命令', 'オペランド', '拡張'],
    nop: ['制御フロー', '操作なし'],
    return: ['void', 'メソッド', '復帰'],
    tableswitch: ['int', '制御フロー', 'テーブル分岐'],
    lookupswitch: ['int', '制御フロー', '検索分岐'],
  };
  if (special[name]) return join(...special[name]);
  const description = (descriptions as Record<string, string>)[name];
  if (!description) return join('命令', name);
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
        ? 'ビット演算'
        : operation.startsWith('比較')
          ? '比較'
          : '算術',
      operation,
    );
  return join(group, operation);
}
