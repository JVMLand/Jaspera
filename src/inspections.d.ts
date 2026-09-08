export interface Inspection {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  start: number;
  end: number;
  title?: string;
  edits?: { start: number; end: number; text: string }[];
}
export function inspectSource(source: string): Inspection[];
