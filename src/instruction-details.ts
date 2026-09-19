import { displayMessage as msg } from './messages.ts';
// Behaviour beyond the diagrams. Every supported instruction has an explicit family.
export function instructionDetails(op: string) {
  const arithmetic = op.match(/^([ilfd])(add|sub|mul|div|rem|and|or|xor|shl|shr|ushr)$/);
  if (arithmetic) {
    const [, kind, operation] = arithmetic,
      integer = kind === 'i' || kind === 'l',
      bits = kind === 'l' ? 64 : 32;
    if (['and', 'or', 'xor'].includes(operation))
      return (
        msg('instructions.usesOfBitwiseOperations') +
        (
          {
            and: msg('instructions.useAMaskToKeepOnlySelectedBitsForExample'),
            or: msg('instructions.setSelectedBitsToForExampleORIs'),
            xor: msg('instructions.toggleSelectedBitsForExampleXORIsXOROfA'),
          } as Record<string, string>
        )[operation]
      );
    if (['shl', 'shr', 'ushr'].includes(operation))
      return msg('instructions.bitHandlingShiftDistanceOnlyTheLowestBitsOfThe', [
        kind === 'l' ? 6 : 5,
        bits,
        operation === 'shl'
          ? msg('instructions.fillTheRightWithZerosAndDiscardBitsShiftedOut')
          : operation === 'shr'
            ? msg('instructions.fillTheLeftWithTheOriginalSignBitNegativeValues')
            : msg('instructions.fillTheLeftWithZerosShiftTheSignBitLike'),
      ]);
    if (integer) {
      if (operation === 'div')
        return msg('instructions.integerDivisionRulesRoundingTruncateTowardZeroForExampleIs');
      if (operation === 'rem')
        return msg('instructions.integerRemainderRulesSignANonzeroResultHasTheDividend');
      return msg('instructions.integerArithmeticRulesOverflowBitsBeyondBitsAreDiscardedExceeding', [
        bits,
        kind === 'i' && operation === 'add' ? msg('instructions.forExampleBecomes') : '',
      ]);
    }
    return msg('instructions.floatingPointRulesPrecisionAndSpecialValues', [
      operation === 'rem'
        ? msg('instructions.theRemainderIsBasedOnAQuotientTruncatedTowardZero')
        : msg('instructions.resultsAreRoundedToTheTypeSPrecisionOperationsInvolving'),
      operation === 'div'
        ? msg('instructions.divisionByZeroDoesNotThrowArithmeticExceptionItProducesInfinity')
        : '',
    ]);
  }
  const conversions: Record<string, string> = {
    i2l: msg('instructions.signExtendToBitsTheIntegerValueIsUnchanged'),
    i2d: msg('instructions.everyIntValueIsExactlyRepresentableAsDoubleSoThe'),
    f2d: msg('instructions.widenFloatToDoubleFiniteValuesAreRepresentedExactly'),
    l2i: msg('instructions.keepOnlyTheLowBitsAValueOutsideTheInt'),
    i2f: msg('instructions.integersNotExactlyRepresentableAsFloatAreRounded'),
    l2f: msg('instructions.integersNotExactlyRepresentableAsFloatAreRounded'),
    l2d: msg('instructions.largeIntegersNotExactlyRepresentableAsDoubleAreRounded'),
    d2f: msg('instructions.roundToFloatPrecisionVeryLargeValuesMayBecomeInfinity'),
    i2b: msg('instructions.keepTheLowBitsAndSignExtendToIntFor'),
    i2s: msg('instructions.keepTheLowBitsAndSignExtendToInt'),
    i2c: msg('instructions.keepTheLowBitsAndFillTheUpperBitsWith'),
    f2i: msg('instructions.truncateTowardZeroNaNBecomesOutOfRangeValuesBecome'),
    f2l: msg('instructions.truncateTowardZeroNaNBecomesOutOfRangeValuesBecome'),
    d2i: msg('instructions.truncateTowardZeroNaNBecomesOutOfRangeValuesBecome'),
    d2l: msg('instructions.truncateTowardZeroNaNBecomesOutOfRangeValuesBecome'),
  };
  if (conversions[op]) return msg('instructions.conversionRules') + conversions[op];
  const section = (heading: string, text: string) => `### ${heading}\n\n${text}`;
  const type = (
    {
      i: 'int',
      l: 'long',
      f: 'float',
      d: 'double',
      a: msg('instructions.reference'),
      b: 'byte / boolean',
      c: 'char',
      s: 'short',
    } as Record<string, string>
  )[op[0]];
  let match: RegExpMatchArray | null;
  if ((match = op.match(/^([ilfda])(load|store)(?:_([0-3]))?$/)))
    return section(
      msg('instructions.selectingALocalVariable'),
      (match[3] === undefined
        ? msg('instructions.writeAZeroBasedSlotIndexAfterTheInstructionUse')
        : msg('instructions.theSuffixIsTheSlotIndexDoNotAddAn', [match[3]])) +
        '\n\n' +
        (match[2] === 'load'
          ? msg('instructions.loadingLeavesTheLocalValueUnchangedTheSlotMustAlready')
          : msg('instructions.overwriteThePreviousValue')) +
        (/[ld]/.test(match[1])
          ? msg('instructions.longAndDoubleUseTheSelectedSlotAndTheNext')
          : '') +
        (match[1] === 'a'
          ? '\n\n' +
            (match[2] === 'load'
              ? msg('instructions.nullCanBeLoadedAsAnOrdinaryReferenceAloadCannot')
              : msg('instructions.storingAReferenceDoesNotCopyTheObjectItCan'))
          : ''),
    );
  if (op === 'iinc')
    return section(
      msg('instructions.incrementAmount'),
      msg('instructions.writeTheSlotIndexFollowedByTheIntegerIncrementIinc'),
    );
  if (op === 'aconst_null')
    return section(
      msg('instructions.whatNullMeans'),
      msg('instructions.aReferenceToNoObjectItsTypeDiffersFromThe'),
    );
  if ((match = op.match(/^([ilfd])const_(m1|[0-5])$/)))
    return section(
      msg('instructions.constantEncodedInTheInstruction'),
      msg('instructions.theValueIsPartOfTheInstructionNameDoNot', [
        type,
        match[2] === 'm1' ? '-1' : match[2],
        /[fd]/.test(match[1]) && match[2] === '0' ? msg('instructions.thisZeroIsPositive') : '',
      ]),
    );
  if (/^[bs]ipush$/.test(op))
    return section(
      msg('instructions.valueRange'),
      msg('instructions.isEmbeddedInTheInstructionItIsSignExtendedTo', [
        op === 'bipush'
          ? msg('instructions.aSignedBitIntegerFromTo')
          : msg('instructions.aSignedBitIntegerFromTo2'),
      ]),
    );
  if (/^ldc/.test(op))
    return section(
      msg('instructions.supportedConstants'),
      op === 'ldc2_w'
        ? msg('instructions.loadsALongOrDoubleConstantFromTheConstantPool')
        : msg('instructions.loadsIntFloatStringClassMethodTypeMethodHandleOr', [
            op === 'ldc_w'
              ? msg('instructions.usesABitConstantPoolIndexToSupportLargerPools')
              : msg('instructions.ldcEncodesAnBitConstantPoolIndexFromTo'),
          ]),
    );
  if (/^[ilfd]neg$/.test(op))
    return section(
      msg('instructions.negation'),
      /[il]/.test(op[0])
        ? msg('instructions.zeroStaysZeroTheMinimumValueStaysUnchangedBecauseIts')
        : msg('instructions.positiveAndNegativeZeroExchangeSignsInfinityAlsoChangesSign'),
    );
  if (/^[ilfdabcs]a(load|store)$/.test(op)) {
    const store = op.endsWith('store');
    const special: Record<string, string> = {
      b: store
        ? msg('instructions.storesTheLowBitsInAByteArrayOrThe')
        : msg('instructions.aByteElementIsSignExtendedToIntABoolean'),
      c: store
        ? msg('instructions.storesTheLowBitsAsChar')
        : msg('instructions.zeroExtendsCharToIntInTheRange'),
      s: store
        ? msg('instructions.storesTheLowBitsAsShort')
        : msg('instructions.signExtendsTheBitShortToInt'),
      a: store
        ? msg('instructions.theReferenceMustBeAssignableToTheArraySActual')
        : msg('instructions.pushesTheStoredReferenceWithoutCopyingTheObjectANull'),
    };
    return section(
      msg('instructions.arrayElements'),
      msg('instructions.indicesStartAtTheArrayContainsValuesANullArray', [
        type,
        special[op[0]] ?? '',
      ]),
    );
  }
  if (/^(get|put)(field|static)$/.test(op)) {
    const put = op.startsWith('put'),
      instance = op.endsWith('field');
    return section(
      msg('instructions.specifyingAField'),
      msg('instructions.writeTheClassNameFieldNameAndTypeDescriptorCounter') +
        (instance
          ? msg('instructions.aNullTargetReferenceThrowsNullPointerException')
          : msg('instructions.ifTheDeclaringClassHasNotBeenInitializedItIs')) +
        (put
          ? msg('instructions.theValueMustMatchTheFieldTypeAFinalField') +
            (instance
              ? msg('instructions.constructorInit')
              : msg('instructions.classInitializerClinit')) +
            msg('instructions.sentenceSeparator')
          : ''),
    );
  }
  const calls: Record<string, string> = {
    invokevirtual: msg('instructions.selectsTheOverriddenMethodUsingTheObjectSActualClass'),
    invokeinterface: msg(
      'instructions.callsAnInstanceMethodDeclaredByAnInterfaceTheImplementation',
    ),
    invokespecial: msg(
      'instructions.usedForConstructorsInitAndSuperclassMethodsWithRulesDifferent',
    ),
    invokestatic: msg('instructions.callsAStaticMethodNoThisReferenceIsPushedIf'),
    invokedynamic: msg('instructions.theTargetComesFromACallSiteResolvedByABootstrap'),
  };
  if (calls[op])
    return (
      section(msg('instructions.howTheTargetIsSelected'), calls[op]) +
      sectionBreak(
        msg('instructions.argumentsAndReturnValue'),
        msg('instructions.inADescriptorParenthesesContainTheParametersTheReturnType') +
          (!['invokestatic', 'invokedynamic'].includes(op)
            ? msg('instructions.pushTheTargetReferenceBeforeTheArgumentsANullReference')
            : '') +
          msg('instructions.aReturnTypeOfVPushesNoReturnValue'),
      )
    );
  if (/^[ilfda]?return$/.test(op))
    return section(
      msg('instructions.returningToTheCaller'),
      op === 'return'
        ? msg('instructions.usedInMethodsReturningVVoidExecutionResumesAfterThe')
        : msg('instructions.passesOneValueToTheCallerSStackAndResumes') +
            (op === 'ireturn'
              ? msg('instructions.methodsReturningBooleanByteCharOrShortAlsoUseIreturn')
              : op === 'areturn'
                ? msg('instructions.theReferenceMustBeAssignableToTheDeclaredReturnType')
                : msg('instructions.theMethodMustReturn', [type])),
    );
  if (op === 'athrow')
    return section(
      msg('instructions.exceptionPropagation'),
      msg('instructions.requiresAReferenceToThrowableOrASubclassThrowingNull'),
    );
  if (/^if/.test(op))
    return section(
      msg('instructions.valuesBeingCompared'),
      /^if_acmp/.test(op)
        ? msg('instructions.comparesObjectIdentityNotContentsTwoNullReferencesAreEqual')
        : /^ifnonnull$|^ifnull$/.test(op)
          ? msg('instructions.comparesOneReferenceWithNullUsefulForCheckingAReference')
          : /^if_icmp/.test(op)
            ? msg('instructions.comparesTwoIntValuesItCannotDirectlyCompareLongFloat')
            : msg('instructions.popsOneIntAndComparesItWith') +
              (op === 'ifeq'
                ? msg('instructions.forABooleanBranchesOnFalse')
                : op === 'ifne'
                  ? msg('instructions.forABooleanBranchesOnTrueNonzero')
                  : ''),
    );
  if (/^[lfd]cmp/.test(op))
    return section(
      msg('instructions.comparisonResult'),
      msg('instructions.pushesIfTheEarlierValueIsLessThanTOPIf') +
        (op === 'lcmp'
          ? msg('instructions.unlikeSubtractionThisComparisonCannotOverflow')
          : msg('instructions.ifEitherOperandIsNaNPushesNaNWillNotTake', [
              op.endsWith('l') ? '−1' : '1',
              op.endsWith('l')
                ? msg('instructions.whenTestingGreaterThanWithIfgt')
                : msg('instructions.whenTestingLessThanWithIflt'),
            ])),
    );
  if (/switch$/.test(op))
    return section(
      msg('instructions.selectingABranch'),
      op === 'tableswitch'
        ? msg('instructions.aTableMapsAContinuousIntegerRangeToTargetsValues')
        : msg('instructions.listsIntegerKeysAndTargetsIfNoKeyMatchesGoes'),
    );
  if (/^goto/.test(op))
    return section(
      msg('instructions.unconditionalBranch'),
      msg('instructions.jumpsToALabelInTheSameMethodForExample') +
        (op === 'goto_w'
          ? msg('instructions.usesASignedBitRelativeOffsetAllowingLongerJumpsThan')
          : msg('instructions.theBytecodeUsesASignedBitRelativeOffsetFromTo')),
    );
  if (/^jsr/.test(op) || op === 'ret')
    return section(
      msg('instructions.legacySubroutineInstruction'),
      (op === 'ret'
        ? msg('instructions.theOperandIsALocalSlotIndexResumesWithinThe')
        : msg('instructions.pushesTheNextInstructionSAddressAsReturnAddressThenJumps', [
            op === 'jsr_w' ? '32' : '16',
          ])) + msg('instructions.usedByOldFinallyImplementationsForbiddenInClassFileVersion'),
    );
  const objectDetails: Record<string, string> = {
    new: msg('instructions.allocatesAnInstanceOfTheNamedClassFieldsStartAs'),
    newarray: msg('instructions.specifyAPrimitiveDescriptorSuchAsIIntOrZ'),
    anewarray: msg('instructions.specifyAReferenceTypeDescriptorAndPushTheLengthElements'),
    multianewarray: msg('instructions.specifyAnArrayDescriptorAndHowManyDimensionsToAllocate'),
    arraylength: msg('instructions.returnsTheNumberOfElementsTheLastIndexIsLength'),
    checkcast: msg('instructions.checksWhetherTheReferenceCanBeTreatedAsTheSpecified'),
    instanceof: msg('instructions.pushesIfTheReferencedObjectIsAssignableToTheSpecified'),
    monitorenter: msg('instructions.acquiresTheObjectSMonitorWaitingIfAnotherThreadOwns'),
    monitorexit: msg('instructions.decrementsTheCurrentThreadSMonitorCountAtZeroOther'),
    nop: msg('instructions.doesNothingAndAdvancesToTheNextInstructionOccupiesOne'),
    wide: msg('instructions.widensTheNextLoadStoreOrRetLocalIndexTo'),
  };
  if (objectDetails[op])
    return section(
      op.startsWith('monitor')
        ? msg('instructions.monitorOwnership')
        : op === 'wide'
          ? msg('instructions.widenedOperands')
          : msg('instructions.behaviorAndConstraints'),
      objectDetails[op],
    );
  if (/^(pop|dup|swap)/.test(op))
    return section(
      msg('instructions.rearrangingValues'),
      op.startsWith('pop')
        ? msg('instructions.discardsAnUnusedValueSuchAsAReturnValue') +
            (op === 'pop'
              ? msg('instructions.removesOneCategoryValueItCannotRemoveHalfOfA')
              : msg('instructions.removesTwoCategoryValuesOrOneLongOrDoubleA'))
        : op === 'swap'
          ? msg('instructions.swapsTOPWithTheValueBelowItBothMustBe')
          : msg('instructions.keepsACopyBeforeACalculationOrStoreConsumesThe'),
    );
  throw new Error(`Missing instruction explanation: ${op}`);
}
function sectionBreak(heading: string, text: string) {
  return `\n\n### ${heading}\n\n${text}`;
}
