/** Three-way source comparison shared by directory watching and its regression tests. */
export function sourceMerge(base:string|undefined,local:string|undefined,remote:string|undefined):'unchanged'|'apply'|'conflict'{
 if(base===remote)return 'unchanged';
 if(local===base||local===remote)return 'apply';
 return 'conflict';
}
