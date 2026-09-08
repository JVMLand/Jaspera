import { entryMethods } from './entry-method.js';
import { parseJal } from './jal-parse.js';
import { parameterSlots } from './parameter-slots.js';
import { calculateOffsets } from './offsets.js';
import { inspectSource } from './inspections.js';

export function analyzeSource(source, parser = parseJal) {
  const snapshots = new Map();
  const parse = (text) => {
    if (!snapshots.has(text)) snapshots.set(text, parser(text));
    return snapshots.get(text);
  };
  return {
    entry: entryMethods(source, parse),
    parameters: parameterSlots(source, parse),
    offsets: calculateOffsets(source, parse),
    inspections: inspectSource(source, parse),
  };
}
