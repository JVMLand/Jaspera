import {parameterSlots} from './parameter-slots.js';
import {expose} from 'comlink';
import {inspectSource} from './inspections.js';
import {calculateOffsets} from './offsets.js';
const api={analyze(source:string){return {parameters:parameterSlots(source),offsets:calculateOffsets(source),inspections:inspectSource(source)};}};
export type OffsetsApi=typeof api;
expose(api);
