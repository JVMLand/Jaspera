export interface Span {start:number;end:number}
export interface SymbolReference extends Span {kind:'class'|'method'|'field'|'label';owner:string;name?:string;descriptor?:string;target?:Span}
export interface ClassSymbol extends Span {owner:string;parents:string[];members:(Span & {kind:'method'|'field';static:boolean;name:string;descriptor:string})[]}
export interface SymbolIndex {classes:ClassSymbol[];references:SymbolReference[]}
export function analyzeSymbols(source:string):SymbolIndex;
