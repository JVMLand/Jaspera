import { entryMethods } from './entry-method.ts';
import { parseJal } from './jal-parse.ts';
import { parameterSlots } from './parameter-slots.ts';
import { calculateOffsets } from './offsets.ts';
import { inspectSource } from './inspections.ts';

export function analyzeSource(source: string, parser = parseJal) {
  const snapshots = new Map<string, ReturnType<typeof parseJal>>();
  const parse = (text: string) => {
    if (!snapshots.has(text)) snapshots.set(text, parser(text));
    return snapshots.get(text)!;
  };
  return {
    entry: entryMethods(source, parse),
    parameters: parameterSlots(source, parse),
    offsets: calculateOffsets(source, parse),
    inspections: inspectSource(source, parse),
  };
}
