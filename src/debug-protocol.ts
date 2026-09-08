/** Runtime values, copied only while the VM is suspended. */
export interface DebugLocation {thread:number;frame:number;sequence:number;className:string;method:string;descriptor:string;pc:number;line:number;depth:number}
export interface DebugInstruction {fieldDescriptor?:string;opcode:string;local:number;increment:number;arguments:number;returns:boolean;dimensions:number;constant?:string}
export interface DebugFrame {callSnapshot?:boolean;instruction?:DebugInstruction;id:number;className:string;method:string;descriptor:string;pc:number;line:number;native:boolean;stack:string[];locals:string[]}
export interface DebugSnapshot {location:DebugLocation;frames:DebugFrame[];reason:'entry'|'breakpoint'|'step'|'pause'}
export interface DebugBreakpoint {className:string;line:number}
export type DebugCommand='continue'|'pause'|'into'|'over'|'out';
export interface DebugOptions {stopOnEntry?:boolean;classes:string[];breakpoints:DebugBreakpoint[]}
export interface DebugState {instructionLocation?:{uri:string;line:number};documents?:Record<string,string>;status:'idle'|'starting'|'running'|'paused'|'finished';snapshot?:DebugSnapshot;previous?:DebugSnapshot;breakpoints:{uri:string;line:number}[]}
