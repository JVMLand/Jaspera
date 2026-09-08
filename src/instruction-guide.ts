import { msg, displayMessage, displayText } from './messages.js';
import { relatedInstructions } from './instruction-relations';
import { instructionDetails } from './instruction-details';
import language from './generated/language.json';
export const categories = [
  msg('m8e546e43c588'),
  msg('mf69d44a6ff07'),
  msg('m2dea9a4af76d'),
  msg('mdba6a11d4d1e'),
  msg('m2f4756018980'),
  msg('me51441670471'),
  msg('m8b03112bd0bb'),
  msg('m794a49d55773'),
  msg('m0ba8b412c1a3'),
  msg('m7b7d672a1cc6'),
] as const;
export function category(op: string): string {
  if (/^(?:[ilfda](?:load|store|const)|[bs]ipush|ldc)/.test(op)) return categories[0];
  if (/^[ilfd](?:add|sub|mul|div|rem|neg|and|or|xor|shl|shr|ushr)$/.test(op) || op === 'iinc')
    return categories[1];
  if (/^[ilfd]2/.test(op)) return categories[2];
  if (
    /^(?:[ilfdabcs]a(?:load|store)|new|anewarray|multianewarray|arraylength|checkcast|instanceof|get|put)/.test(
      op,
    )
  )
    return categories[3];
  if (/^(pop|dup|swap)/.test(op)) return categories[4];
  if (/^(if|goto|jsr|ret$|[lfd]cmp|table|lookup)/.test(op)) return categories[5];
  if (/^(invoke|[ilfda]?return)/.test(op)) return categories[6];
  if (op === 'athrow') return categories[7];
  if (op.startsWith('monitor')) return categories[8];
  return categories[9];
}
export const instructionList = language.instructions.filter((op) => op !== 'aload_4');
const types: Record<string, string> = {
  i: 'int',
  l: 'long',
  f: 'float',
  d: 'double',
  a: msg('mad087912287e'),
  b: 'byte / boolean',
  c: 'char',
  s: 'short',
};
export interface Diagram {
  label: string;
  before: string[];
  after: string[];
  note?: string;
  locals?: { before: string[]; after: string[] };
}
export function guide(op: string) {
  const msg = displayMessage;
  const doc = (language.documents as Record<string, { title: string; markdown: string }>)[op];
  const markdown = doc.markdown;
  let summary = doc.title;
  const forms: Diagram[] = [],
    type = displayText(types[op[0]] ?? '') || msg('m19126213b0d1');
  let example = op;
  const add = (
    before: string[],
    after: string[],
    note?: string,
    locals?: Diagram['locals'],
    label = msg('mbbbbf1a9c219'),
  ) => forms.push({ before, after, note, locals, label });
  let m = op.match(/^([ilfda])(load|store)(?:_(\d))?$/);
  if (m) {
    const slot = m[3] ?? 'N',
      value = `a : ${type}`;
    example = m[3] ? op : op + ' 1';
    if (m[2] === 'load') {
      summary = msg('m2c1ad4ee5b02', [slot, type]);
      add([], [value]);
    } else {
      summary = msg('m62897c1b4837', [type, slot]);
      add([value], [], undefined, {
        before: [msg('mdf917c29b768', [slot])],
        after: [`#${slot}: ${value}`],
      });
    }
  } else if (op === 'iinc') {
    summary = msg('m6045d562ddfd');
    example = 'iinc 1 1';
    add([], [], msg('m75266457fa9e'), { before: ['#1: 3 : int'], after: ['#1: 4 : int'] });
  } else if (/const_|^[bs]ipush$|^ldc/.test(op)) {
    const v =
      op === 'aconst_null'
        ? 'null'
        : op.startsWith('ldc')
          ? op === 'ldc2_w'
            ? msg('m7f5e17f252b3')
            : msg('m673af6892c3c')
          : op.endsWith('m1')
            ? '-1 : int'
            : op.includes('const_')
              ? op.split('_')[1] + ' : ' + type
              : msg('m7905ab386e63');
    summary = msg('mba9a5b466943');
    example = /^[bs]ipush$/.test(op)
      ? op + ' 10'
      : op.startsWith('ldc')
        ? op + (op === 'ldc2_w' ? ' 10L' : ' "Hello"')
        : op;
    add([], [v]);
  } else if ((m = op.match(/^([ilfd])(add|sub|mul|div|rem|and|or|xor|shl|shr|ushr)$/))) {
    const operation = m[2],
      symbols: Record<string, string> = {
        add: '+',
        sub: '−',
        mul: '×',
        div: '/',
        rem: '%',
        and: 'AND',
        or: 'OR',
        xor: 'XOR',
        shl: '<<',
        shr: '>>',
        ushr: '>>>',
      };
    const descriptions: Record<string, string> = {
      add: msg('m5d3de4d0c8be'),
      sub: msg('m56d9b92495b5'),
      mul: msg('md00445023b84'),
      div: msg('m4b284500c9ec'),
      rem: msg('m02ec4b50364e'),
      and: msg('m529dfc32c756'),
      or: msg('m075f61190e68'),
      xor: msg('me915c414bdcf'),
    };
    if (['shl', 'shr', 'ushr'].includes(operation)) {
      summary = msg('m449d8c62335d', [
        type,
        operation === 'shl' ? msg('me2e0c454e5d5') : msg('m14ab1f2bce0a'),
      ]);
      add([`a : ${type}`, 'b : int'], [`a ${symbols[operation]} b : ${type}`]);
    } else {
      const ordered = ['sub', 'div', 'rem'].includes(operation);
      summary = msg('m500ce4222966', [type, descriptions[operation]]);
      if (ordered) summary += operation === 'sub' ? msg('m762d756e0e91') : msg('m2290abcc5309');
      const labels = ['a', 'b'];
      const bitNote: Record<string, string> = {
        and: msg('mdde0bacf05c7'),
        or: msg('mc112423ea5d0'),
        xor: msg('me90f809d14da'),
      };
      add(
        labels.map((label) => `${label} : ${type}`),
        [`${labels[0]} ${symbols[operation]} ${labels[1]} : ${type}`],
        bitNote[operation],
      );
    }
  } else if (/^[ilfd]neg$/.test(op)) add([`a : ${type}`], [`−a : ${type}`]);
  else if (/^[ilfd]2/.test(op)) {
    summary = msg('m1a5eb9d20ed3', [type, types[op[2]]]);
    add(
      [`a : ${type}`],
      [`a : ${'bcs'.includes(op[2]) ? 'int' : types[op[2]]}`],
      'bcs'.includes(op[2]) ? msg('mf33346297ce4') : undefined,
    );
  } else if (/^[ilfdabcs]a(load|store)$/.test(op)) {
    const store = op.endsWith('store'),
      valueType = 'bcs'.includes(op[0]) ? 'int' : type;
    summary = store ? msg('m3832b966107f') : msg('m58a146a6fd20');
    add(
      [msg('mdb69a6fefc2b'), msg('m103cd80357aa'), ...(store ? [`a : ${valueType}`] : [])],
      store ? [] : [msg('mea4bc0fefcb8', [valueType])],
      'bcs'.includes(op[0]) ? msg('m611076c7f27a') : undefined,
    );
  } else if (/^(get|put)(field|static)$/.test(op)) {
    const put = op.startsWith('put'),
      instance = op.endsWith('field');
    summary = msg('m4bd13e15fba0', [
      instance ? msg('m44c9e5b70aec') : msg('m0aade573c17c'),
      put ? msg('m9a747b006815') : msg('m2467d08c11ed'),
      instance ? msg('m3e4978ceb8e3') : msg('m79f1ea6a829b'),
    ]);
    example =
      op +
      ' ' +
      (instance
        ? 'Example->value:I'
        : put
          ? 'Counter->count:I'
          : 'java/lang/System->out:Ljava/io/PrintStream;');
    add(
      [...(instance ? [msg('m6b8ca8ac63c6')] : []), ...(put ? [msg('md4b6298e2d74')] : [])],
      put ? [] : [msg('m01eb3530196a')],
      msg('m7b39f8ba5e6d'),
    );
  } else if (op.startsWith('invoke')) {
    const instance = !['invokestatic', 'invokedynamic'].includes(op);
    summary = msg('mf7cb071ef1f4', [instance ? msg('mdea704894d8b') : msg('m7d341bb44cea')]);
    example =
      op === 'invokevirtual'
        ? 'invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V'
        : op === 'invokestatic'
          ? 'invokestatic java/lang/Math->abs(I)I'
          : op;
    add(
      [...(instance ? [msg('m6b8ca8ac63c6')] : []), msg('mb2907610236b'), msg('mc97edeb9770d')],
      [msg('mcd8e4c178488')],
      msg('m6f46d36ee7ec'),
      undefined,
      msg('mbdd478a08a9a'),
    );
    add(
      [...(instance ? [msg('m6b8ca8ac63c6')] : []), msg('mb2907610236b'), msg('mc97edeb9770d')],
      [],
      msg('mda5b944bc9cc'),
      undefined,
      msg('md1773c6cd594'),
    );
  } else if (/^[ilfda]?return$/.test(op)) {
    summary = op === 'return' ? msg('m9145f942321c') : msg('mb05b298fbb6e', [type]);
    add(op === 'return' ? [] : [`a : ${type}`], [msg('mdfd98a9ea8c1')], msg('ma66a2ceb6569'));
  } else if (op === 'athrow')
    add([msg('m2b1c97135153')], [msg('m254470c093e1')], msg('mbce0a329445b'));
  else if (/^if/.test(op)) {
    summary = msg('m47190a757fc6');
    example = op + ' Label';
    add(/cmp/.test(op) ? ['a', 'b'] : ['a'], []);
  } else if (/^[lfd]cmp/.test(op))
    add(
      [`a : ${type}`, `b : ${type}`],
      ['−1 / 0 / 1 : int'],
      op === 'lcmp' ? msg('ma2fb959091ac') : msg('mc76520dbae4a', [op.endsWith('l') ? '−1' : '1']),
    );
  else if (/switch$/.test(op)) add([msg('m8a5bb1efa37b')], [], msg('m0bf3d79b03e3'));
  else if (/^goto/.test(op)) {
    example = op + ' Label';
    add([], [], msg('m24708598c5e3'));
  } else if (/^jsr/.test(op)) add([], [msg('mf29c52345c23')], msg('m671606955c50'));
  else if (op === 'ret') add([], [], msg('m81390137ba0d'));
  else if (op === 'new') {
    example = 'new java/lang/StringBuilder';
    add([], [msg('md5c6513fe78e')], msg('mfdc34a81d4fa'));
  } else if (/^(a?newarray|multianewarray)$/.test(op))
    add(op === 'multianewarray' ? [msg('m5dd57919fa4f')] : [msg('m5d9a260ae01e')], [
      msg('mdb69a6fefc2b'),
    ]);
  else if (op === 'arraylength') add([msg('mdb69a6fefc2b')], [msg('m5d9a260ae01e')]);
  else if (op === 'checkcast')
    add([msg('mad087912287e')], [msg('m6b11ed5a5bb9')], msg('mbe338a04678a'));
  else if (op === 'instanceof')
    add([msg('mad087912287e')], [msg('m5e83723c8df8')], msg('ma3087e52e167'));
  else if (op.startsWith('monitor'))
    add(
      [msg('m6b8ca8ac63c6')],
      [],
      op === 'monitorenter' ? msg('m5d744ce937c9') : msg('mb2c11db74a82'),
    );
  else if (op === 'nop') add([], [], msg('m0825b9e7b65c'));
  else if (op === 'wide') {
    example = 'wide iload 256';
    add([], [msg('m7dc787e3963f')], msg('m11c5e568dfaf'));
  } else {
    // The source documentation groups stack-manipulation variants; isolate the selected mnemonic.
    let section = markdown.split('スタック効果:**')[1]?.split(/\n##### /)[0] ?? '';
    const groups = section.split(/\n\*\s+\*\*/);
    const selected = groups.find((g) => g.replace(/\\_/g, '_').startsWith(op + '**'));
    if (selected) section = selected;
    const pairs = [...section.matchAll(/Before:\s*`([^`]+)`([^\n]*)[\s\S]*?After:\s*`([^`]+)`/g)];
    pairs.forEach((m, i) =>
      add(
        m[1]
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '...'),
        m[3]
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '...'),
        m[2].trim() || msg('mbf5bd34425a0'),
        undefined,
        pairs.length > 1 ? msg('m5ec329e9d315') + (i + 1) : msg('mbbbbf1a9c219'),
      ),
    );
  }
  const constraints: Record<string, string[]> = {
    pop: [msg('m163318dce9b9')],
    pop2: [msg('m237499e886a3'), msg('m87e00b404cda')],
    dup: [msg('m163318dce9b9')],
    swap: [msg('m237499e886a3')],
    dup_x1: [msg('m4efd7b7ff248')],
    dup_x2: [msg('m4efd7b7ff248'), msg('m5f4cacc6fe8d')],
    dup2: [msg('m237499e886a3'), msg('m87e00b404cda')],
    dup2_x1: [msg('m4efd7b7ff248'), msg('m176c3dab040d')],
    dup2_x2: [
      msg('m4efd7b7ff248'),
      msg('m77312eb2917b'),
      msg('m2ff2a3cfed07'),
      msg('m98c979da6874'),
    ],
  };

  if (/^if/.test(op)) {
    const relation: Record<string, string> = {
      eq: msg('m2880241e47be'),
      ne: msg('m0087b09be570'),
      lt: msg('m6c458331fdb8'),
      ge: msg('m159f4405819e'),
      gt: msg('mf4d626e791cd'),
      le: msg('m9b892087bc3a'),
    };
    const condition =
      op === 'ifnull'
        ? msg('m0a1860fc5455')
        : op === 'ifnonnull'
          ? msg('m6a728cfa68ee')
          : /cmp/.test(op)
            ? ['eq', 'ne'].includes(op.slice(-2))
              ? msg('m739ad7c588e0', [relation[op.slice(-2)]])
              : msg('mee426fee14bc', [relation[op.slice(-2)]])
            : msg('m6f82f59d4842', [relation[op.slice(-2)]]);
    summary = msg('maf409b650601', [condition]);
  }
  const summaries: Record<string, string> = {
    invokevirtual: msg('m4d3effe6f10b'),
    invokeinterface: msg('m43fb8fdebb4a'),
    invokespecial: msg('m5405e17c55c6'),
    invokestatic: msg('m2264b90bf20c'),
    invokedynamic: msg('m70194b8d61df'),
    new: msg('m0ea269be5023'),
    newarray: msg('md47e56625d2b'),
    anewarray: msg('m8dcb1fa10b03'),
    multianewarray: msg('m2214f1e7f805'),
    arraylength: msg('mb4056d78fc3d'),
    checkcast: msg('m99845a0e7cff'),
    instanceof: msg('m721b4c4fb435'),
    athrow: msg('m7d29f12f7a23'),
    monitorenter: msg('m74f36a272b55'),
    monitorexit: msg('m5bddf6a54d7c'),
    tableswitch: msg('m8099ed8d33fa'),
    lookupswitch: msg('mb2f277e25979'),
    nop: msg('mea0ab59c8d14'),
    wide: msg('ma39ee8080899'),
    ret: msg('m470fb4417bf1'),
    pop: msg('me488bfb4faa5'),
    pop2: msg('mfc143b663145'),
    dup: msg('m277d04127866'),
    dup_x1: msg('m936ce9660fa0'),
    dup_x2: msg('mc772e70819d7'),
    dup2: msg('mfc9d81428e36'),
    dup2_x1: msg('mc927d48bc222'),
    dup2_x2: msg('m1d821ffcdbc3'),
    swap: msg('m0312649c8f5a'),
  };
  if (summaries[op]) summary = summaries[op];
  if (op === 'aconst_null') summary = msg('m9cad33eedae9');
  if ((m = op.match(/^([ilfd])const_(m1|[0-5])$/)))
    summary = msg('m93fd184cbb6f', [type, m[2] === 'm1' ? '-1' : m[2]]);
  if (/^[bs]ipush$/.test(op)) summary = msg('mf3f6765e9890', [op === 'bipush' ? '8' : '16']);
  if (/^ldc/.test(op))
    summary =
      op === 'ldc2_w'
        ? msg('m9791989a8fd1')
        : msg('m053ab8d3b5a0') + (op === 'ldc_w' ? msg('ma4fb1a1be573') : '');
  if (/^[ilfd]neg$/.test(op)) summary = msg('m48289e61eefd', [type]);
  if (/^[lfd]cmp/.test(op)) summary = msg('mc10d408e8574', [type]);
  if (/^goto/.test(op)) summary = msg('ma154bf67ba26');
  if (/^jsr/.test(op)) summary = msg('m63fd64956ec9');
  if (/^if_acmp/.test(op))
    summary = msg('mee060e3f3bf7', [
      op.endsWith('eq') ? msg('mf43bdb68df12') : msg('m0087b09be570'),
    ]);
  if (/^[ilfdabcs]a(load|store)$/.test(op))
    summary = msg('m5ae8881f0584', [
      type,
      op.endsWith('store') ? msg('m6df91e11478f') : msg('m164b68b66c7e'),
    ]);
  const examples: Record<string, string> = {
    newarray: 'newarray I',
    anewarray: 'anewarray Ljava/lang/String;',
    multianewarray: 'multianewarray [[I 2',
    checkcast: 'checkcast Ljava/lang/String;',
    instanceof: 'instanceof Ljava/lang/String;',
    invokeinterface: 'invokeinterface java/util/List->size()I',
    invokespecial: 'invokespecial java/lang/StringBuilder-><init>()V',
    tableswitch: 'tableswitch 0 { Zero, One, Two } default Other',
    lookupswitch: 'lookupswitch { 1: One, 100: Hundred, default: Other }',
    jsr: 'jsr Finally',
    jsr_w: 'jsr_w Finally',
    ret: 'ret 1',
  };
  if (examples[op]) example = examples[op];
  if (constraints[op]) forms.forEach((form, i) => (form.note = constraints[op][i]));
  const names = (text: string) =>
    text
      .replace(/value([1-4])|値([1-4])/g, (_, a, b) => 'abcd'[Number(a ?? b) - 1])
      .replace(/\bvalue\b/g, 'a');
  for (const form of forms) {
    form.before = form.before.map(names);
    form.after = form.after.map(names);
    if (form.note) form.note = names(form.note);
  }
  return {
    op,
    opcode: (language.opcodes as Record<string, number>)[op],
    related: relatedInstructions(op),
    category: category(op),
    title: displayText(doc.title),
    summary,
    example,
    forms,
    markdown: instructionDetails(op),
  };
}
