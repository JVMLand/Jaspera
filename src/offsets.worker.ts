import {formatJal} from './formatter.js';
import {analyzeSource} from './source-analysis-core.js';
import {expose} from 'comlink';
const api={format:formatJal,analyze:analyzeSource};
export type OffsetsApi=typeof api;
expose(api);
