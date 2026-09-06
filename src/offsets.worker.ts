import {expose} from 'comlink';
import {inspectSource} from './inspections.js';
import {calculateOffsets} from './offsets.js';
const api={analyze(source:string){return {offsets:calculateOffsets(source),inspections:inspectSource(source)};}};
export type OffsetsApi=typeof api;
expose(api);
