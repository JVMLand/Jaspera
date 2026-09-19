export interface Span {
  start: number;
  end: number;
}
export interface SymbolReference extends Span {
  kind: 'class' | 'method' | 'field' | 'label';
  owner: string;
  name?: string;
  descriptor?: string;
  target?: Span;
}
export interface ClassSymbol extends Span {
  owner: string;
  parents: string[];
  members: (Span & {
    kind: 'method' | 'field';
    hasCode?: boolean;
    static: boolean;
    name: string;
    descriptor: string;
  })[];
}
export interface SymbolIndex {
  classes: ClassSymbol[];
  references: SymbolReference[];
}

import { parseJal, collectRules } from './jal-parse.ts';
import JALLexer from './generated/offset-parser/JALLexer.ts';
import {
  ClassDefinitionContext,
  ClassPropSuperClassContext,
  ClassPropInterfacesContext,
  FieldDefinitionContext,
  MethodDefinitionContext,
  LabelContext,
  LabelNameContext,
  JvmInsArgFieldRefContext,
  JvmInsArgMethodRefContext,
  FullQualifiedClassNameContext,
} from './generated/offset-parser/JALParser.ts';
import { ParserRuleContext } from 'antlr4';
const span = (n: ParserRuleContext) => ({ start: n.start.start, end: n.stop!.stop + 1 });
export function analyzeSymbols(source: string): SymbolIndex {
  const result: SymbolIndex = { classes: [], references: [] };
  if (source.length > 1024 * 1024) return result;
  try {
    const { stream: tokens, root } = parseJal(source);
    const valid = (n: ParserRuleContext | undefined): n is ParserRuleContext =>
      !!n && n.start.start >= 0 && !!n.stop && n.stop.stop >= n.start.start && !n.exception;
    const add = (node: ParserRuleContext, ref: Omit<SymbolReference, keyof Span>) => {
      if (valid(node)) result.references.push({ ...span(node), ...ref });
    };
    for (const c of collectRules(root, ClassDefinitionContext)) {
      const classNode = c.className();
      if (!valid(classNode)) continue;
      const owner = classNode.getText(),
        superNode = collectRules(c, ClassPropSuperClassContext)[0]?.className();
      const interfaces = collectRules(c, ClassPropInterfacesContext).flatMap((n) =>
        n.className_list().map((x) => x.getText()),
      );
      const info: ClassSymbol = {
        owner,
        ...span(classNode),
        parents: [
          superNode?.getText() ?? (owner === 'java/lang/Object' ? '' : 'java/lang/Object'),
          ...interfaces,
        ].filter(Boolean),
        members: [],
      };
      result.classes.push(info);
      for (const f of collectRules(c, FieldDefinitionContext))
        if (valid(f.fieldName()) && valid(f.typeDescriptor()))
          info.members.push({
            kind: 'field',
            static: f
              .accModField()
              .accAttrField_list()
              .some((a) => a.getText() === 'static'),
            name: f.fieldName().getText(),
            descriptor: f.typeDescriptor().getText(),
            ...span(f.fieldName()),
          });
      for (const m of collectRules(c, MethodDefinitionContext)) {
        if (!valid(m.methodName()) || !valid(m.methodDescriptor())) continue;
        info.members.push({
          kind: 'method',
          hasCode: !m
            .accModMethod()
            .accAttrMethod_list()
            .some((a) => a.getText() === 'native' || a.getText() === 'abstract'),
          static: m
            .accModMethod()
            .accAttrMethod_list()
            .some((a) => a.getText() === 'static'),
          name: m.methodName().getText(),
          descriptor: m.methodDescriptor().getText(),
          ...span(m.methodName()),
        });
        const labels = collectRules(m, LabelContext);
        for (const label of collectRules(m, LabelNameContext)) {
          const name = label.getText(),
            targets = labels.filter((l) => l.labelName().getText() === name);
          if (targets.length === 1)
            add(label, { kind: 'label', owner, name, target: span(targets[0].labelName()) });
        }
      }
      for (const ref of collectRules(c, JvmInsArgFieldRefContext))
        if (valid(ref.typeDescriptor()))
          add(ref.fieldName(), {
            kind: 'field',
            owner: ref.fullQualifiedClassName().getText(),
            name: ref.fieldName().getText(),
            descriptor: ref.typeDescriptor().getText(),
          });
      for (const ref of collectRules(c, JvmInsArgMethodRefContext))
        if (valid(ref.methodDescriptor()))
          add(ref.methodName(), {
            kind: 'method',
            owner:
              ref.arrayTypeDescriptor()?.getText() ??
              ref.fullQualifiedClassName()?.getText() ??
              owner,
            name: ref.methodName().getText(),
            descriptor: ref.methodDescriptor().getText(),
          });
      for (const ref of collectRules(c, FullQualifiedClassNameContext))
        if (ref.start.start !== classNode.start.start)
          add(ref, { kind: 'class', owner: ref.getText() });
    }
    // Object types may be embedded in a single METHOD_DESCRIPTOR lexer token.
    for (const token of tokens.tokens)
      if (
        token.channel === 0 &&
        (token.type === JALLexer.METHOD_DESCRIPTOR || token.type === JALLexer.TYPE_DESC_OBJECT)
      ) {
        for (const match of token.text.matchAll(/L([\w$/]+);/g))
          result.references.push({
            kind: 'class',
            owner: match[1],
            start: token.start + match.index + 1,
            end: token.start + match.index + 1 + match[1].length,
          });
      }
  } catch {
    /* Incomplete source may have only a partial index. */
  }
  return result;
}
