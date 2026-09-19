export interface EntryMethods {
  owner: string;
  parent: string;
  abstract: boolean;
  constructors: string[];
  methods: { descriptor: string; static: boolean; abstract: boolean }[];
}

import { parseJal, ruleChildren } from './jal-parse.ts';
import { ParserRuleContext } from 'antlr4';
import {
  ClassDefinitionContext,
  ClassPropSuperClassContext,
  MethodDefinitionContext,
} from './generated/offset-parser/JALParser.ts';
export function entryMethods(source: string, parse = parseJal): EntryMethods {
  if (source.length > 1024 * 1024)
    return { owner: '', parent: '', abstract: false, constructors: [], methods: [] };
  try {
    const { root, stream, errors } = parse(source);
    const info: EntryMethods = {
      owner: '',
      parent: 'java/lang/Object',
      abstract: false,
      constructors: [],
      methods: [],
    };
    const visit = (node: ParserRuleContext) => {
      if (node instanceof ClassDefinitionContext) {
        info.owner = node.className().getText();
        info.abstract = stream.tokens
          .slice(node.start.tokenIndex, node.className().start.tokenIndex)
          .some((t) => t.channel === 0 && ['abstract', 'interface'].includes(t.text));
      }
      if (node instanceof ClassPropSuperClassContext) info.parent = node.className().getText();
      if (node instanceof MethodDefinitionContext) {
        const name = node.methodName()?.start,
          descriptor = node.methodDescriptor()?.start;
        if (
          !name ||
          !descriptor ||
          descriptor.tokenIndex < 0 ||
          errors.some((i) => i >= node.start.tokenIndex && i <= descriptor.tokenIndex)
        )
          return;
        const flags = stream.tokens
          .slice(node.start.tokenIndex, name.tokenIndex)
          .filter((t) => t.channel === 0)
          .map((t) => t.text);
        if (name.text === '<init>') info.constructors.push(descriptor.text);
        if (
          name.text === 'main' &&
          !flags.includes('private') &&
          ['()V', '([Ljava/lang/String;)V'].includes(descriptor.text)
        )
          info.methods.push({
            descriptor: descriptor.text,
            static: flags.includes('static'),
            abstract: flags.includes('abstract'),
          });
        return;
      }
      for (const child of ruleChildren(node)) visit(child);
    };
    visit(root);
    return info;
  } catch {
    return { owner: '', parent: '', abstract: false, constructors: [], methods: [] };
  }
}
export function entryProblem(entry: EntryMethods | undefined, classes: EntryMethods[] = []) {
  if (!entry?.owner) return 'run.noMain';
  for (const descriptor of ['([Ljava/lang/String;)V', '()V']) {
    let current: EntryMethods | undefined = entry;
    const seen = new Set();
    while (current && !seen.has(current.owner)) {
      seen.add(current.owner);
      const method = current.methods.find((m) => m.descriptor === descriptor);
      if (method) {
        if (method.abstract || (!method.static && entry.abstract)) return 'run.abstractMain';
        if (!method.static && entry.constructors.length && !entry.constructors.includes('()V'))
          return 'run.noConstructor';
        return '';
      }
      const parent: string = current.parent;
      current = classes.find((c) => c.owner === parent);
    }
  }
  return 'run.noMain';
}
