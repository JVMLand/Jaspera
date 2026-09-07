import {analyzeSymbols} from './symbols.js';
import {expose} from 'comlink';
import ELK from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';
import {positionGraphs} from './graph-layout';
import type {MethodGraph} from './protocol';
// ELK owns its worker protocol; the outer worker adds the shared timeout/lifecycle boundary.
const elk=new ELK({algorithms:['layered'],workerFactory:()=>new ElkWorker()});
const api={outline:(source:string)=>analyzeSymbols(source).classes.flatMap(c=>c.members.filter(m=>m.kind==='method'&&m.hasCode!==false).map(m=>({name:m.name+m.descriptor,owner:c.owner}))),positionGraphs:(methods:MethodGraph[])=>positionGraphs(methods,elk)};
export type GraphLayoutApi=typeof api;expose(api);
