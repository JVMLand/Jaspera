import { formatJal } from './formatter.ts';
import { analyzeSource } from './source-analysis-core.ts';
import { expose } from 'comlink';
const api = { format: formatJal, analyze: analyzeSource };
export type OffsetsApi = typeof api;
expose(api);
