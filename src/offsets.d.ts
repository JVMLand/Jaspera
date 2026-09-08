export interface SourceOffset {
  line: number;
  offset: number;
  method: string;
}
export function calculateOffsets(source: string): SourceOffset[];
