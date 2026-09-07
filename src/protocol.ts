export interface StackFrame {consumed?:number;produced?:number;terminal?:string;line:number;column:number;length:number;unreachable?:boolean;before?:string[];after?:string[];local?:number;effect?:string;localsBefore?:string[];localsAfter?:string[]}
export interface Diagnostic { severity: 'error' | 'warning'; message: string; line: number; column: number; length: number }
export interface GraphNode {id:string;text:string;opcode:string;block:string;line:number;column:number;consumed:number;produced:number;unreachable:boolean}
export interface GraphEdge {from:string;to:string;kind:'stack'|'local'|'control'|'exception';label:string}
export interface MethodGraph {name:string;nodes:GraphNode[];edges:GraphEdge[]}
export interface GraphDocument {uri:string;source:string;version:number;line:number;column:number}
export interface Compilation { graphs?:MethodGraph[]; stackFrames?:StackFrame[]; classes?: {className:string;bytecode:string}[]; className: string; bytecode: string; diagnostics: Diagnostic[] }
export interface Disassembly {className:string;source:string}
export type RuntimeRequest = {type:'disassemble';bytecode:string} | {type:'compile';source:string} | {type:'run';compilation:Compilation;stdin:string};
export interface RuntimeEvents {analysis(progress:AnalysisProgress):void;progress(loaded:number,total:number):void;output(stream:'stdout'|'stderr',text:string):void}

export interface AnalysisProgress {graph?:MethodGraph;finished?:boolean;phase:"queued"|"loading"|"parse"|"analysis"|"frames"|"layout"|"complete";owner?:string;method?:string;completed:number;total:number}
