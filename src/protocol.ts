export interface StackFrame {line:number;column:number;length:number;unreachable?:boolean;before?:string[];after?:string[];local?:number;effect?:string;localsBefore?:string[];localsAfter?:string[]}
export interface Diagnostic { severity: 'error' | 'warning'; message: string; line: number; column: number; length: number }
export interface Compilation { stackFrames?:StackFrame[]; classes?: {className:string;bytecode:string}[]; className: string; bytecode: string; diagnostics: Diagnostic[] }
export interface Disassembly {className:string;source:string}
export type RuntimeRequest = {type:'disassemble';bytecode:string} | {type:'compile';source:string} | {type:'run';compilation:Compilation;stdin:string};
export interface RuntimeEvents {progress(loaded:number,total:number):void;output(stream:'stdout'|'stderr',text:string):void}
