import type { parameterSlots } from './parameter-slots.js';
import type { calculateOffsets } from './offsets.js';
import type { inspectSource } from './inspections.js';
export function analyzeSource(source: string): {
  parameters: ReturnType<typeof parameterSlots>;
  offsets: ReturnType<typeof calculateOffsets>;
  inspections: ReturnType<typeof inspectSource>;
};
