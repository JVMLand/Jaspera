import {expose} from 'comlink';
import ELK from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';
import {positionGraphs} from './graph-layout';
import type {MethodGraph} from './protocol';
// ELK owns its worker protocol; the outer worker adds the shared timeout/lifecycle boundary.
const elk=new ELK({algorithms:['layered'],workerFactory:()=>new ElkWorker()});
const api={positionGraphs:(methods:MethodGraph[])=>positionGraphs(methods,elk)};
export type GraphLayoutApi=typeof api;expose(api);
