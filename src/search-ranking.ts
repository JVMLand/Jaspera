import type { SearchTarget } from './navigation';
const normalize = (value: string) => value.toLowerCase().replace(/->|\//g, '.');
export function searchTargets(targets: SearchTarget[], query: string) {
  const text = normalize(query.trim()),
    words = text.split(/\s+/).filter(Boolean);
  return targets
    .map((target, index) => {
      const label = normalize(target.label),
        owner = normalize(target.detail);
      // Descriptors mention other types; those matches are less specific than declaration names.
      const name =
        target.kind === 'method'
          ? label.split('(')[0]
          : target.kind === 'field'
            ? label.split(':')[0]
            : label;
      const qualified =
        target.kind === 'class' || target.kind === 'file' ? owner : owner + '.' + name;
      const identity = qualified + ' ' + name,
        full = owner + '.' + label;
      let score = Infinity;
      if (!words.length) score = target.kind === 'file' ? 0 : 10;
      else if (words.every((word) => full.includes(word))) {
        if (text === name || text === qualified) score = 0;
        else if (name.startsWith(text) || qualified.startsWith(text)) score = 1;
        else if (words.every((word) => identity.includes(word))) score = 2;
        else score = 3;
      }
      return { target, index, score };
    })
    .filter((row) => Number.isFinite(row.score))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, 100)
    .map((row) => row.target);
}
