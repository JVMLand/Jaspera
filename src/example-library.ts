import { localizedMessage } from './localization';
import HelloWorld from './examples/HelloWorld.jal?raw';
import Arithmetic from './examples/Arithmetic.jal?raw';
import Branches from './examples/Branches.jal?raw';
import Loop from './examples/Loop.jal?raw';
import Arrays from './examples/Arrays.jal?raw';
import Strings from './examples/Strings.jal?raw';
import Collections from './examples/Collections.jal?raw';
import Methods from './examples/Methods.jal?raw';
import LongAndDouble from './examples/LongAndDouble.jal?raw';
import type { WorkspaceLayout } from './workspace-layout';
export const examples = Object.entries({
  HelloWorld,
  Arithmetic,
  Branches,
  Loop,
  Arrays,
  Strings,
  Collections,
  Methods,
  LongAndDouble,
}).map(([name, source]) => ({ path: 'example/' + name + '.jal', source }));
export const isExampleKey = (key: string) => key.startsWith('preview:example:');
const edits = new Map<string, string>();
export function translatedExample(path: string) {
  const example = examples.find((e) => e.path === path);
  if (!example) return;
  const name = path
    .split('/')
    .pop()!
    .replace(/\.jal$/, '');
  let source = example.source.replace(
    /^\/\/[^\n]*/,
    () => '// ' + localizedMessage('example.' + name + '.comment'),
  );
  const literals: Record<string, string> = {
    'Hello, JAL!': 'example.hello',
    '10 or less': 'example.less',
    'greater than 10': 'example.greater',
    'Answer: ': 'example.answer',
  };
  source = source.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (literal, value) =>
    literals[value] ? JSON.stringify(localizedMessage(literals[value])) : literal,
  );
  return source;
}
export const exampleSource = (path: string) => edits.get(path) ?? translatedExample(path);
export const rememberExample = (path: string, source: string) => {
  if (source === translatedExample(path)) edits.delete(path);
  else edits.set(path, source);
};
export const isEditedExample = (path: string) => edits.has(path);
// Transient example documents never enter project metadata or folder/ZIP exports.
export function withoutExampleLayout(layout: WorkspaceLayout): WorkspaceLayout {
  const keep = (key: string) => !isExampleKey(key);
  const views = (value: WorkspaceLayout['views']) =>
    Object.fromEntries(Object.entries(value).filter(([key]) => keep(key)));
  return {
    ...layout,
    order: layout.order?.filter(keep),
    tabs: layout.tabs.filter((t) => keep(t.key)),
    selected: Object.fromEntries(Object.entries(layout.selected).filter(([, key]) => keep(key))),
    views: views(layout.views),
    windows: layout.windows
      .map((w) => ({
        ...w,
        order: w.order?.filter(keep),
        tabs: w.tabs.filter(keep),
        active: keep(w.active) ? w.active : '',
        views: views(w.views),
      }))
      .filter((w) => w.tabs.length || w.panels.length),
  };
}
