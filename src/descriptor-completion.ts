import type { Catalog, Candidate } from './completion';

/** A declaration may be incomplete; do not require a successful compile to complete it. */
export function descriptorContext(source: string) {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\]|\\.)*"/g, (text) =>
    text.replace(/[^\n]/g, ' '),
  );
  let depth = 0,
    boundary = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') {
      depth++;
      boundary = i + 1;
    }
    if (code[i] === '}') {
      depth--;
      boundary = i + 1;
    }
  }
  if (depth !== 1) return;
  const declaration = code
    .slice(boundary)
    .match(
      /(?:^|\n)\s*(?:(?:public|protected|private|static|final|synchronized|bridge|varargs|native|abstract|strict|synthetic)\s+)*(?:[\w$]+|<init>|<clinit>)\s*\(([^{}]*)$/,
    );
  if (!declaration) return;
  const descriptor = declaration[1];
  const close = descriptor.indexOf(')');
  if (close !== -1 && descriptor.indexOf(')', close + 1) !== -1) return;
  const returns = close !== -1;
  const text = returns ? descriptor.slice(close + 1) : descriptor;
  let at = 0;
  if (!returns) {
    // Consume complete preceding parameters, leaving the currently edited type intact.
    for (;;) {
      const next = text.slice(at).match(/^(?:\[*L[\w$/]+;|\[*[BCDFIJSZ](?![a-z]))/);
      if (!next) break;
      at += next[0].length;
    }
  }
  const partial = text.slice(at);
  if (!/^\[*[\w$/.]*$/.test(partial)) return;
  return { start: source.length - partial.length, partial, returns };
}

export function completeDescriptor(
  partial: string,
  returns: boolean,
  catalog: Catalog,
): Candidate[] {
  const arrays = partial.match(/^\[*/)?.[0] ?? '';
  const typed = partial.slice(arrays.length);
  const queries = [typed, ...(typed.startsWith('L') ? [typed.slice(1)] : [])].map((value) =>
    value.replaceAll('.', '/').toLowerCase(),
  );
  const primitives: Record<string, string> = {
    B: 'byte',
    C: 'char',
    D: 'double',
    F: 'float',
    I: 'int',
    J: 'long',
    S: 'short',
    Z: 'boolean',
  };
  if (returns && !arrays) primitives.V = 'void';
  const items: Candidate[] = [];
  for (const [code, name] of Object.entries(primitives)) {
    if (typed && !name.startsWith(typed.toLowerCase()) && code !== typed.toUpperCase()) continue;
    const descriptor = arrays + code;
    items.push({
      label: descriptor,
      insertText: descriptor,
      detail: name + '[]'.repeat(arrays.length),
      kind: 'class',
    });
  }
  for (const owner of Object.keys(catalog).sort()) {
    if (
      !queries.some(
        (query) =>
          !query ||
          owner.toLowerCase().startsWith(query) ||
          owner.split('/').at(-1)!.toLowerCase().startsWith(query),
      )
    )
      continue;
    const descriptor = arrays + 'L' + owner + ';';
    items.push({
      label: descriptor,
      insertText: descriptor,
      detail: owner.replaceAll('/', '.') + '[]'.repeat(arrays.length),
      kind: 'class',
    });
  }
  return items.slice(0, 120);
}
