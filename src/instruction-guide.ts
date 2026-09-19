import { msg, displayMessage, displayText } from './messages.ts';
import { relatedInstructions } from './instruction-relations';
import { instructionDetails } from './instruction-details';
import language from './generated/language.json';
export const categories = [
  msg('instructions.loadsStoresAndConstants'),
  msg('instructions.arithmeticAndBitOperations'),
  msg('instructions.typeConversion'),
  msg('instructions.objectsArraysAndFields'),
  msg('instructions.stackManipulation'),
  msg('instructions.comparisonsAndBranches'),
  msg('instructions.methodCallsAndReturns'),
  msg('instructions.exception'),
  msg('instructions.synchronization'),
  msg('instructions.auxiliaryInstructions'),
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
  a: msg('instructions.reference'),
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
    type = displayText(types[op[0]] ?? '') || msg('instructions.value');
  let example = op;
  const add = (
    before: string[],
    after: string[],
    note?: string,
    locals?: Diagram['locals'],
    label = msg('instructions.basicForm'),
  ) => forms.push({ before, after, note, locals, label });
  let m = op.match(/^([ilfda])(load|store)(?:_(\d))?$/);
  if (m) {
    const slot = m[3] ?? 'N',
      value = `a : ${type}`;
    example = m[3] ? op : op + ' 1';
    if (m[2] === 'load') {
      summary = msg('instructions.copyTheValueFromLocalVariableToTheTopOf', [slot, type]);
      add([], [value]);
    } else {
      summary = msg('instructions.popTheTopValueAndStoreItInLocalVariable', [type, slot]);
      add([value], [], undefined, {
        before: [msg('instructions.previousValue', [slot])],
        after: [`#${slot}: ${value}`],
      });
    }
  } else if (op === 'iinc') {
    summary = msg('instructions.addTheSpecifiedNumberToAnIntLocalVariableUpdate');
    example = 'iinc 1 1';
    add([], [], msg('instructions.thisExampleIncrementsBy'), {
      before: ['#1: 3 : int'],
      after: ['#1: 4 : int'],
    });
  } else if (/const_|^[bs]ipush$|^ldc/.test(op)) {
    const v =
      op === 'aconst_null'
        ? 'null'
        : op.startsWith('ldc')
          ? op === 'ldc2_w'
            ? msg('instructions.constantLongDouble')
            : msg('common.constant')
          : op.endsWith('m1')
            ? '-1 : int'
            : op.includes('const_')
              ? op.split('_')[1] + ' : ' + type
              : msg('instructions.integerInt');
    summary = msg('instructions.pushTheSpecifiedConstantOntoTheStackForLaterInstructions');
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
      add: msg('instructions.addition'),
      sub: msg('instructions.subtraction'),
      mul: msg('instructions.multiplication'),
      div: msg('instructions.division'),
      rem: msg('instructions.remainderCalculation'),
      and: msg('instructions.bitwiseAND'),
      or: msg('instructions.bitwiseOR'),
      xor: msg('instructions.bitwiseXOR'),
    };
    if (['shl', 'shr', 'ushr'].includes(operation)) {
      summary = msg('instructions.shiftAValueToTheTheTopIntSpecifiesThe', [
        type,
        operation === 'shl' ? msg('instructions.left') : msg('instructions.right'),
      ]);
      add([`a : ${type}`, 'b : int'], [`a ${symbols[operation]} b : ${type}`]);
    } else {
      const ordered = ['sub', 'div', 'rem'].includes(operation);
      summary = msg('instructions.popTwoValuesPerformAndPushOneResult', [
        type,
        descriptions[operation],
      ]);
      if (ordered)
        summary +=
          operation === 'sub'
            ? msg('instructions.subtractTheTopValueFromTheValueBelowIt')
            : msg('instructions.divideTheValueBelowTheTopByTheTopValue');
      const labels = ['a', 'b'];
      const bitNote: Record<string, string> = {
        and: msg('instructions.aResultBitIsOnlyWhenBothInputBitsAre'),
        or: msg('instructions.aResultBitIsWhenAtLeastOneInputBit'),
        xor: msg('instructions.aResultBitIsOnlyWhenTheTwoInputBits'),
      };
      add(
        labels.map((label) => `${label} : ${type}`),
        [`${labels[0]} ${symbols[operation]} ${labels[1]} : ${type}`],
        bitNote[operation],
      );
    }
  } else if (/^[ilfd]neg$/.test(op)) add([`a : ${type}`], [`−a : ${type}`]);
  else if (/^[ilfd]2/.test(op)) {
    summary = msg('instructions.convertTheStackValueFromTo', [type, types[op[2]]]);
    add(
      [`a : ${type}`],
      [`a : ${'bcs'.includes(op[2]) ? 'int' : types[op[2]]}`],
      'bcs'.includes(op[2])
        ? msg('instructions.narrowToTheSpecifiedTypeWidthThenRepresentTheValue')
        : undefined,
    );
  } else if (/^[ilfdabcs]a(load|store)$/.test(op)) {
    const store = op.endsWith('store'),
      valueType = 'bcs'.includes(op[0]) ? 'int' : type;
    summary = store
      ? msg('instructions.popAnArrayReferenceIndexAndValueThenStoreThe')
      : msg('instructions.popAnArrayReferenceAndIndexThenReadTheSpecified');
    add(
      [
        msg('instructions.arrayReference'),
        msg('instructions.indexInt'),
        ...(store ? [`a : ${valueType}`] : []),
      ],
      store ? [] : [msg('instructions.element', [valueType])],
      'bcs'.includes(op[0])
        ? msg('instructions.byteBooleanCharAndShortArrayElementsAreRepresentedAs')
        : undefined,
    );
  } else if (/^(get|put)(field|static)$/.test(op)) {
    const put = op.startsWith('put'),
      instance = op.endsWith('field');
    summary = msg('instructions.theField', [
      instance ? msg('instructions.instance2') : msg('instructions.staticClass'),
      put ? msg('instructions.write') : msg('instructions.read'),
      instance
        ? msg('instructions.theTargetObjectReferenceMustAlsoBeOnTheStack')
        : msg('instructions.noTargetObjectReferenceIsNeeded'),
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
      [
        ...(instance ? [msg('instructions.targetObject')] : []),
        ...(put ? [msg('instructions.valueMatchingTheFieldType')] : []),
      ],
      put ? [] : [msg('instructions.fieldValue')],
      msg('instructions.theDescriptorAfterDeterminesTheType'),
    );
  } else if (op.startsWith('invoke')) {
    const instance = !['invokestatic', 'invokedynamic'].includes(op);
    summary = msg('instructions.popAndCallTheMethodIfItReturnsAValue', [
      instance ? msg('instructions.targetObjectAndArguments') : msg('instructions.arguments'),
    ]);
    example =
      op === 'invokevirtual'
        ? 'invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V'
        : op === 'invokestatic'
          ? 'invokestatic java/lang/Math->abs(I)I'
          : op;
    add(
      [
        ...(instance ? [msg('instructions.targetObject')] : []),
        msg('instructions.argument'),
        msg('instructions.argumentN'),
      ],
      [msg('common.returnValue')],
      msg('instructions.aVVoidReturnTypePushesNoReturnValue'),
      undefined,
      msg('instructions.methodReturningAValue'),
    );
    add(
      [
        ...(instance ? [msg('instructions.targetObject')] : []),
        msg('instructions.argument'),
        msg('instructions.argumentN'),
      ],
      [],
      msg('instructions.inADescriptorParametersAreInsideTheParenthesesAndThe'),
      undefined,
      msg('instructions.methodReturningVoid'),
    );
  } else if (/^[ilfda]?return$/.test(op)) {
    summary =
      op === 'return'
        ? msg('instructions.endTheCurrentMethodAndReturnToTheCallerWithout')
        : msg('instructions.popAValueReturnItToTheCallerAndEnd', [type]);
    add(
      op === 'return' ? [] : [`a : ${type}`],
      [msg('instructions.methodEnds')],
      msg('instructions.theCurrentStackAndLocalVariableArrayAreDiscardedThe'),
    );
  } else if (op === 'athrow')
    add(
      [msg('instructions.exceptionObject')],
      [msg('instructions.handlerExceptionObject')],
      msg('instructions.executionDoesNotContinueToTheNextInstructionAMatching'),
    );
  else if (/^if/.test(op)) {
    summary = msg('instructions.testTheConditionAndJumpToTheLabelIfTrue');
    example = op + ' Label';
    add(/cmp/.test(op) ? ['a', 'b'] : ['a'], []);
  } else if (/^[lfd]cmp/.test(op))
    add(
      [`a : ${type}`, `b : ${type}`],
      ['−1 / 0 / 1 : int'],
      op === 'lcmp'
        ? msg('instructions.pushTheComparisonResultThisDoesNotBranch')
        : msg('instructions.ifEitherValueIsNaNPush', [op.endsWith('l') ? '−1' : '1']),
    );
  else if (/switch$/.test(op))
    add(
      [msg('instructions.switchKeyInt')],
      [],
      msg('instructions.jumpToTheMatchingTargetOrDefaultIfNoneMatches'),
    );
  else if (/^goto/.test(op)) {
    example = op + ' Label';
    add([], [], msg('instructions.jumpToTheLabelWithoutMovingValues'));
  } else if (/^jsr/.test(op))
    add(
      [],
      [msg('instructions.returnAddress')],
      msg('instructions.usedByOldFinallyImplementationsItsUseIsRestrictedIn'),
    );
  else if (op === 'ret') add([], [], msg('instructions.jumpToTheReturnAddressInLocalVariableNUse'));
  else if (op === 'new') {
    example = 'new java/lang/StringBuilder';
    add(
      [],
      [msg('instructions.uninitializedObjectReference')],
      msg('instructions.afterAllocationCallInitUsingInvokespecialToInitializeTheObject'),
    );
  } else if (/^(a?newarray|multianewarray)$/.test(op))
    add(
      op === 'multianewarray'
        ? [msg('instructions.lengthOfEachDimensionInt')]
        : [msg('instructions.lengthInt')],
      [msg('instructions.arrayReference')],
    );
  else if (op === 'arraylength')
    add([msg('instructions.arrayReference')], [msg('instructions.lengthInt')]);
  else if (op === 'checkcast')
    add(
      [msg('instructions.reference')],
      [msg('instructions.sameReference')],
      msg('instructions.checkWhetherTheReferenceCanBeTreatedAsTheTarget'),
    );
  else if (op === 'instanceof')
    add(
      [msg('instructions.reference')],
      [msg('instructions.matchesDoesNotMatch')],
      msg('instructions.theResultHasTypeIntForNullTheResultIs'),
    );
  else if (op.startsWith('monitor'))
    add(
      [msg('instructions.targetObject')],
      [],
      op === 'monitorenter'
        ? msg('instructions.acquireTheObjectSMonitor')
        : msg('instructions.releaseTheObjectSMonitor'),
    );
  else if (op === 'nop')
    add([], [], msg('instructions.changeNothingAndContinueToTheNextInstruction'));
  else if (op === 'wide') {
    example = 'wide iload 256';
    add(
      [],
      [msg('instructions.valueInt')],
      msg('instructions.thisExampleUsesWideIloadWideGivesTheNextInstruction'),
    );
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
        m[2].trim() || msg('instructions.seeTheDetailedExplanationForValueCategoryRestrictions'),
        undefined,
        pairs.length > 1 ? msg('instructions.form') + (i + 1) : msg('instructions.basicForm'),
      ),
    );
  }
  const constraints: Record<string, string[]> = {
    pop: [msg('instructions.valueIsCategory')],
    pop2: [msg('instructions.value1AndValue2AreCategory'), msg('instructions.valueIsCategory2')],
    dup: [msg('instructions.valueIsCategory')],
    swap: [msg('instructions.value1AndValue2AreCategory')],
    dup_x1: [msg('instructions.allValuesAreCategory')],
    dup_x2: [
      msg('instructions.allValuesAreCategory'),
      msg('instructions.theTopValue1IsCategoryValue2BelowItIsCategory'),
    ],
    dup2: [msg('instructions.value1AndValue2AreCategory'), msg('instructions.valueIsCategory2')],
    dup2_x1: [
      msg('instructions.allValuesAreCategory'),
      msg('instructions.theTopValue1IsCategoryValue2BelowItIsCategory2'),
    ],
    dup2_x2: [
      msg('instructions.allValuesAreCategory'),
      msg('instructions.theTopValue1IsCategoryValue2AndValue3BelowIt'),
      msg('instructions.theTopValue1AndValue2AreCategoryValue3BelowThem'),
      msg('instructions.value1AndValue2AreCategory2'),
    ],
  };

  if (/^if/.test(op)) {
    const relation: Record<string, string> = {
      eq: msg('instructions.equal'),
      ne: msg('instructions.different'),
      lt: msg('instructions.lessThan'),
      ge: msg('instructions.greaterThanOrEqualTo'),
      gt: msg('instructions.greaterThan'),
      le: msg('instructions.lessThanOrEqualTo'),
    };
    const condition =
      op === 'ifnull'
        ? msg('instructions.theReferenceIsNull')
        : op === 'ifnonnull'
          ? msg('instructions.theReferenceIsNotNull')
          : /cmp/.test(op)
            ? ['eq', 'ne'].includes(op.slice(-2))
              ? msg('instructions.theTwoValuesAre', [relation[op.slice(-2)]])
              : msg('instructions.theValueBelowTheTopIsTheTopValue', [relation[op.slice(-2)]])
            : msg('instructions.theTopIntValueIs', [relation[op.slice(-2)]]);
    summary = msg('instructions.ifJumpToTheLabelOtherwiseContinueToTheNext', [condition]);
  }
  const summaries: Record<string, string> = {
    invokevirtual: msg('instructions.callAnInstanceMethodAccordingToTheObjectSActual'),
    invokeinterface: msg('instructions.callTheImplementationOfAnInterfaceMethodProvidedByThe'),
    invokespecial: msg('instructions.callAConstructorOrSuperclassMethodUsingRulesDifferentFrom'),
    invokestatic: msg('instructions.callTheSpecifiedStaticMethodOnlyArgumentsAreNeededOn'),
    invokedynamic: msg('instructions.invokeTheTargetLinkedByTheBootstrapMethodTheDescriptor'),
    new: msg('instructions.allocateANewClassInstanceAndPushItsUninitializedReference'),
    newarray: msg('instructions.createAPrimitiveArrayOfTheSpecifiedLengthAndPush'),
    anewarray: msg('instructions.createAReferenceArrayOfTheSpecifiedLengthAndPush'),
    multianewarray: msg('instructions.popTheLengthsOfTheDimensionsAndCreateAMultidimensional'),
    arraylength: msg('instructions.popAnArrayReferenceAndPushItsElementCountAs'),
    checkcast: msg('instructions.checkWhetherAReferenceCanBeTreatedAsTheSpecified'),
    instanceof: msg('instructions.testWhetherTheReferencedObjectMatchesTheSpecifiedTypeAnd'),
    athrow: msg(
      'instructions.throwAnExceptionObjectInterruptingNormalExecutionAndTransferringControl',
    ),
    monitorenter: msg('instructions.acquireTheObjectSMonitorToBeginMutualExclusionWith'),
    monitorexit: msg('instructions.releaseOneAcquisitionOfTheObjectSMonitor'),
    tableswitch: msg('instructions.lookUpAnIntKeyInAContiguousRangeTable'),
    lookupswitch: msg('instructions.findTheEntryMatchingTheIntKeyAndJumpTo'),
    nop: msg('instructions.leaveTheStackAndLocalsUnchangedAndContinueToThe'),
    wide: msg('instructions.widenTheLocalVariableIndexOrIincIncrementEncodedBy'),
    ret: msg('instructions.jumpToAReturnAddressStoredInALocalVariableThis'),
    pop: msg('instructions.removeOneCategoryValueFromTheTopOfTheStack'),
    pop2: msg('instructions.removeTwoCategoryValuesOrOneCategoryValueFromThe'),
    dup: msg('instructions.duplicateTheTopCategoryValueAndPushTheCopyAbove'),
    dup_x1: msg('instructions.duplicateTheTopCategoryValueAndInsertTheCopyBelow'),
    dup_x2: msg('instructions.duplicateTheTopCategoryValueAndInsertTheCopyBelow2'),
    dup2: msg('instructions.duplicateTheTopTwoSlotsOfValuesAndPushThe'),
    dup2_x1: msg('instructions.duplicateTheTopTwoSlotsAndInsertTheCopiesBelow'),
    dup2_x2: msg('instructions.duplicateTheTopTwoSlotsAndInsertTheCopiesBelow2'),
    swap: msg('instructions.swapTheTopTwoValuesBothMustBeCategory'),
  };
  if (summaries[op]) summary = summaries[op];
  if (op === 'aconst_null') summary = msg('instructions.pushNullAReferenceThatPointsToNoObject');
  if ((m = op.match(/^([ilfd])const_(m1|[0-5])$/)))
    summary = msg('instructions.pushTheConstant', [type, m[2] === 'm1' ? '-1' : m[2]]);
  if (/^[bs]ipush$/.test(op))
    summary = msg('instructions.pushTheInstructionSSignedBitIntegerAsInt', [
      op === 'bipush' ? '8' : '16',
    ]);
  if (/^ldc/.test(op))
    summary =
      op === 'ldc2_w'
        ? msg('instructions.loadAndPushALongOrDoubleConstantFromThe')
        : msg('instructions.loadAndPushAStringIntFloatOrOtherSupported') +
          (op === 'ldc_w' ? msg('instructions.thisFormAllowsAWiderConstantPoolIndex') : '');
  if (/^[ilfd]neg$/.test(op))
    summary = msg('instructions.popAValueNegateItAndPushTheResult', [type]);
  if (/^[lfd]cmp/.test(op))
    summary = msg('instructions.compareTwoValuesAndPushIntOrThisInstructionDoes', [type]);
  if (/^goto/.test(op))
    summary = msg('instructions.jumpUnconditionallyToTheLabelWithoutChangingStackValues');
  if (/^jsr/.test(op))
    summary = msg('instructions.pushTheAddressOfTheFollowingInstructionThenJumpTo');
  if (/^if_acmp/.test(op))
    summary = msg('instructions.ifTheTwoReferencesJumpToTheLabelBothCompared', [
      op.endsWith('eq')
        ? msg('instructions.pointToTheSameObjectOrAreBothNull')
        : msg('instructions.different'),
    ]);
  if (/^[ilfdabcs]a(load|store)$/.test(op))
    summary = msg('instructions.forTheIndexedElementOfAArray', [
      type,
      op.endsWith('store')
        ? msg('instructions.writeItPopTheArrayReferenceIndexAndValue')
        : msg('instructions.readItPopTheArrayReferenceAndIndexThenPush'),
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
