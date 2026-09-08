import { msg } from './messages.js';
export type Member = { name: string; kind: 'field' | 'method'; static: boolean };
export type Catalog = Record<string, Member[]>;
export interface Candidate {
  label: string;
  insertText: string;
  detail: string;
  kind: 'field' | 'method' | 'class' | 'snippet';
  snippet?: boolean;
  continue?: boolean;
}
const normalize = (s: string) => s.replace(/->/g, '.').replace(/\//g, '.').toLowerCase();
interface Entry {
  owner: string;
  member: Member;
  aliases: string[];
  priority: number;
}
const indexes = new WeakMap<Catalog, Entry[]>();
function index(catalog: Catalog) {
  let entries = indexes.get(catalog);
  if (entries) return entries;
  entries = [];
  for (const [owner, members] of Object.entries(catalog))
    for (const member of members) {
      const full = normalize(owner),
        simple = full.split('.').pop()!,
        name = member.name;
      const aliases = [
        normalize(full + '.' + name),
        normalize(simple + '.' + name),
        normalize(name),
      ];
      if (owner === 'java/io/PrintStream')
        for (const stream of ['out', 'err'])
          aliases.push(
            normalize('System.' + stream + '.' + name),
            normalize('java.lang.System.' + stream + '.' + name),
          );
      let priority = 100;
      if (owner === 'java/lang/System') priority = 0;
      else if (owner === 'java/io/PrintStream') priority = 10;
      else if (
        [
          'java/lang/String',
          'java/lang/StringBuilder',
          'java/lang/Math',
          'java/lang/Object',
        ].includes(owner)
      )
        priority = 20;
      if (name.includes('(Ljava/lang/String;)')) priority -= 2;
      entries.push({ owner, member, aliases, priority });
    }
  indexes.set(catalog, entries);
  return entries;
}
function match(aliases: string[], query: string) {
  if (!query) return 0;
  if (aliases.some((a) => a.startsWith(query))) return 0;
  return aliases.some((a) => a.includes(query)) ? 1 : -1;
}
export function completeOperand(
  opcode: string,
  typed: string,
  catalog: Catalog,
  origin = 'OpenJDK 23',
): Candidate[] {
  const query = normalize(typed),
    isField = /^(get|put)/.test(opcode),
    isMember = isField || opcode.startsWith('invoke');
  const result: { item: Candidate; score: number }[] = [];
  if (isMember)
    for (const e of index(catalog)) {
      const m = e.member;
      if (
        m.kind !== (isField ? 'field' : 'method') ||
        m.static !== /^(getstatic|putstatic|invokestatic)$/.test(opcode)
      )
        continue;
      if (m.name.startsWith('<init>') && opcode !== 'invokespecial') continue;
      const matched = match(e.aliases, query);
      if (matched < 0) continue;
      const label = e.owner + '->' + m.name;
      result.push({
        item: {
          label,
          insertText: label,
          kind: m.kind,
          detail: msg('mcf421717d49d', [
            m.static ? 'static ' : '',
            m.kind === 'field' ? msg('mdb132d621cb1') : msg('m99942ce88f0b'),
            origin,
          ]),
        },
        score: matched * 1000 + e.priority,
      });
    }
  if (!typed.includes('->'))
    for (const owner of Object.keys(catalog)) {
      const full = normalize(owner),
        matched = match([full, full.split('.').pop()!], query);
      if (matched < 0) continue;
      result.push({
        item: {
          label: owner,
          insertText: owner + (isMember ? '->' : ''),
          kind: 'class',
          continue: isMember,
          detail: msg('m83ff6788f44f', [origin]),
        },
        score: matched * 1000 + (isMember ? 200 : 0),
      });
    }
  return result
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
    .slice(0, 120)
    .map((r) => r.item);
}
export function consoleCompletions(typed: string): Candidate[] {
  if (!typed) return [];
  const query = normalize(typed),
    result: Candidate[] = [];
  for (const stream of ['out', 'err'])
    for (const name of ['println', 'print']) {
      const label = `System.${stream}.${name}`;
      const aliases = [
        normalize(label),
        normalize('java.lang.' + label),
        ...(stream === 'out' ? [name] : []),
      ];
      if (!aliases.some((a) => a.startsWith(query))) continue;
      result.push({
        label,
        kind: 'snippet',
        snippet: true,
        detail: msg('m033d06269686', [
          stream === 'out' ? msg('md38a2a54cf74') : msg('m8f2ead9ae16c'),
          name === 'println' ? msg('m3c94951da277') : '',
        ]),
        insertText: `getstatic java/lang/System->${stream}:Ljava/io/PrintStream;\nldc "\${1:Hello, World!}"\ninvokevirtual java/io/PrintStream->${name}(Ljava/lang/String;)V`,
      });
    }
  return result;
}
