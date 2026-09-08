import { displayMessage as msg } from './messages.js';
// Behaviour beyond the diagrams. Every supported instruction has an explicit family.
export function instructionDetails(op: string) {
  const arithmetic = op.match(/^([ilfd])(add|sub|mul|div|rem|and|or|xor|shl|shr|ushr)$/);
  if (arithmetic) {
    const [, kind, operation] = arithmetic,
      integer = kind === 'i' || kind === 'l',
      bits = kind === 'l' ? 64 : 32;
    if (['and', 'or', 'xor'].includes(operation))
      return (
        msg('md1dcfbbbaecc') +
        (
          {
            and: msg('m36e36efbb343'),
            or: msg('m353c0c86e4fa'),
            xor: msg('mad02029d723f'),
          } as Record<string, string>
        )[operation]
      );
    if (['shl', 'shr', 'ushr'].includes(operation))
      return msg('me7b7c4c96a05', [
        kind === 'l' ? 6 : 5,
        bits,
        operation === 'shl'
          ? msg('m986045c42090')
          : operation === 'shr'
            ? msg('med1f3e951a8c')
            : msg('md32187807c4c'),
      ]);
    if (integer) {
      if (operation === 'div') return msg('mc280ded2681c');
      if (operation === 'rem') return msg('m6c41c5afab95');
      return msg('mecbc1e4eff99', [
        bits,
        kind === 'i' && operation === 'add' ? msg('m274ca1095350') : '',
      ]);
    }
    return msg('ma4cc76892a08', [
      operation === 'rem' ? msg('mfd50d64a8da1') : msg('mbf76e15bf51e'),
      operation === 'div' ? msg('m8ea2d6a35c70') : '',
    ]);
  }
  const conversions: Record<string, string> = {
    i2l: msg('mdc53bb083b58'),
    i2d: msg('mafe166d7309c'),
    f2d: msg('mcd105db66a18'),
    l2i: msg('m529ccca9d88a'),
    i2f: msg('ma6a331fefef3'),
    l2f: msg('ma6a331fefef3'),
    l2d: msg('m0137afcb1c4d'),
    d2f: msg('m62904f41d0cd'),
    i2b: msg('m8d835b48b6ee'),
    i2s: msg('mf225d2191cac'),
    i2c: msg('m5641932f444a'),
    f2i: msg('m2b9eb8b53622'),
    f2l: msg('m2b9eb8b53622'),
    d2i: msg('m2b9eb8b53622'),
    d2l: msg('m2b9eb8b53622'),
  };
  if (conversions[op]) return msg('ma1ca54f22df8') + conversions[op];
  const section = (heading: string, text: string) => `### ${heading}\n\n${text}`;
  const type = (
    {
      i: 'int',
      l: 'long',
      f: 'float',
      d: 'double',
      a: msg('mad087912287e'),
      b: 'byte / boolean',
      c: 'char',
      s: 'short',
    } as Record<string, string>
  )[op[0]];
  let match: RegExpMatchArray | null;
  if ((match = op.match(/^([ilfda])(load|store)(?:_([0-3]))?$/)))
    return section(
      msg('m94dab4f6185b'),
      (match[3] === undefined ? msg('m2dff03dbb4b0') : msg('m52f8ce9bf3a5', [match[3]])) +
        '\n\n' +
        (match[2] === 'load' ? msg('m0fa47a0fca57') : msg('me482cb162004')) +
        (/[ld]/.test(match[1]) ? msg('m7d7d169bef84') : '') +
        (match[1] === 'a'
          ? '\n\n' + (match[2] === 'load' ? msg('m1f316ccc6ec8') : msg('m6a6f0af39e38'))
          : ''),
    );
  if (op === 'iinc') return section(msg('ma07e7bd8a078'), msg('m285c5d84442a'));
  if (op === 'aconst_null') return section(msg('m843c588b0954'), msg('m1351880c946c'));
  if ((match = op.match(/^([ilfd])const_(m1|[0-5])$/)))
    return section(
      msg('m52c825bec874'),
      msg('mbc13fdaf59dd', [
        type,
        match[2] === 'm1' ? '-1' : match[2],
        /[fd]/.test(match[1]) && match[2] === '0' ? msg('m0d5c47b6f297') : '',
      ]),
    );
  if (/^[bs]ipush$/.test(op))
    return section(
      msg('mb0085cc7b5b2'),
      msg('m811c5131084b', [op === 'bipush' ? msg('me9fdc028953c') : msg('mb44bb077ec69')]),
    );
  if (/^ldc/.test(op))
    return section(
      msg('me9699fb1e75a'),
      op === 'ldc2_w'
        ? msg('m01a784a5f6e7')
        : msg('mff7373bef817', [op === 'ldc_w' ? msg('mc6f80ef27462') : msg('ma10ad9fa7488')]),
    );
  if (/^[ilfd]neg$/.test(op))
    return section(
      msg('m158c6187099c'),
      /[il]/.test(op[0]) ? msg('mf71f4bd419f6') : msg('m65e5bd3e6c41'),
    );
  if (/^[ilfdabcs]a(load|store)$/.test(op)) {
    const store = op.endsWith('store');
    const special: Record<string, string> = {
      b: store ? msg('m27e0980bc86a') : msg('m441e836fd219'),
      c: store ? msg('m333416651489') : msg('m886dd888a062'),
      s: store ? msg('ma525d48b8a15') : msg('mb02cb3dd0752'),
      a: store ? msg('m2bf487da9589') : msg('mbdaef410a7b1'),
    };
    return section(msg('m6a2b808b714e'), msg('m757b23347808', [type, special[op[0]] ?? '']));
  }
  if (/^(get|put)(field|static)$/.test(op)) {
    const put = op.startsWith('put'),
      instance = op.endsWith('field');
    return section(
      msg('m58555d38b30a'),
      msg('mf35bf7c737fe') +
        (instance ? msg('m29421d07b20a') : msg('m02b4e7dae579')) +
        (put
          ? msg('m575f0fdfcc02') +
            (instance ? msg('mec4be68dba1b') : msg('m3807c24e6dd8')) +
            msg('ma579b401c2f6')
          : ''),
    );
  }
  const calls: Record<string, string> = {
    invokevirtual: msg('m98db22b24c43'),
    invokeinterface: msg('m9ac11155e8a8'),
    invokespecial: msg('m199c4ecf8d60'),
    invokestatic: msg('m82495767d195'),
    invokedynamic: msg('mf4cdc77994c7'),
  };
  if (calls[op])
    return (
      section(msg('mb03653bd04ac'), calls[op]) +
      sectionBreak(
        msg('ma2a278c4c972'),
        msg('mc765e1bc342f') +
          (!['invokestatic', 'invokedynamic'].includes(op) ? msg('m9082c236f2f2') : '') +
          msg('mf5881e28bd43'),
      )
    );
  if (/^[ilfda]?return$/.test(op))
    return section(
      msg('ma8a78e1453cf'),
      op === 'return'
        ? msg('m70b9e9048951')
        : msg('m5d64710e5e68') +
            (op === 'ireturn'
              ? msg('m7d58a26d553e')
              : op === 'areturn'
                ? msg('m201b645db068')
                : msg('m8b86d625388f', [type])),
    );
  if (op === 'athrow') return section(msg('ma3d9d7d7cad1'), msg('m51519670e5e3'));
  if (/^if/.test(op))
    return section(
      msg('maa07f94b198f'),
      /^if_acmp/.test(op)
        ? msg('m5ecc78041fee')
        : /^ifnonnull$|^ifnull$/.test(op)
          ? msg('mc52b6aa1922b')
          : /^if_icmp/.test(op)
            ? msg('md30da3fcbe8e')
            : msg('me38fd97f8d19') +
              (op === 'ifeq' ? msg('m4fba90a68456') : op === 'ifne' ? msg('ma2326d467013') : ''),
    );
  if (/^[lfd]cmp/.test(op))
    return section(
      msg('m446fb189e6e6'),
      msg('mf66ac3ce37c0') +
        (op === 'lcmp'
          ? msg('ma3a673c211b8')
          : msg('m68a324d0b9ca', [
              op.endsWith('l') ? '−1' : '1',
              op.endsWith('l') ? msg('ma30050be3370') : msg('m6e9bde1f3dd4'),
            ])),
    );
  if (/switch$/.test(op))
    return section(
      msg('md135a50dbe3d'),
      op === 'tableswitch' ? msg('mc2ba8abafcca') : msg('m2f806778c6b4'),
    );
  if (/^goto/.test(op))
    return section(
      msg('m220a70796313'),
      msg('m60cf8e35fc81') + (op === 'goto_w' ? msg('m4c9f5b0c2119') : msg('mb5fef8446838')),
    );
  if (/^jsr/.test(op) || op === 'ret')
    return section(
      msg('mdcce8fb9f28b'),
      (op === 'ret' ? msg('medf96a90b56a') : msg('mb8d8223c2f88', [op === 'jsr_w' ? '32' : '16'])) +
        msg('m898b232a9448'),
    );
  const objectDetails: Record<string, string> = {
    new: msg('mc67f98dc5730'),
    newarray: msg('m748964757650'),
    anewarray: msg('m3d3ceb7494b4'),
    multianewarray: msg('m13124e8fa297'),
    arraylength: msg('mecb86c0a4941'),
    checkcast: msg('m5ff568f2921a'),
    instanceof: msg('mb7e36751d226'),
    monitorenter: msg('m068607887077'),
    monitorexit: msg('mfa4caad4a1e0'),
    nop: msg('ma198c4aad5d4'),
    wide: msg('mc0acbf21ca63'),
  };
  if (objectDetails[op])
    return section(
      op.startsWith('monitor')
        ? msg('mfd72d5f0e53a')
        : op === 'wide'
          ? msg('m2ef2b0beb1b3')
          : msg('m250de5f0835e'),
      objectDetails[op],
    );
  if (/^(pop|dup|swap)/.test(op))
    return section(
      msg('m9eaa7830a34c'),
      op.startsWith('pop')
        ? msg('m759ef43d6cc4') + (op === 'pop' ? msg('mbcc58ea38bc6') : msg('m45f907f7bf17'))
        : op === 'swap'
          ? msg('m8b3e25d0e365')
          : msg('m11de3569c85d'),
    );
  throw new Error(`Missing instruction explanation: ${op}`);
}
function sectionBreak(heading: string, text: string) {
  return `\n\n### ${heading}\n\n${text}`;
}
