import groups from './instruction-highlight-groups.json';
export {groups as instructionHighlightGroups};
export type InstructionGroup=keyof typeof groups;
export const groupNames=Object.keys(groups) as InstructionGroup[];
const membership=new Map(Object.entries(groups).flatMap(([group,ops])=>ops.map(op=>[op,group as InstructionGroup] as const)));
export function instructionHighlightGroup(op:string){return membership.get(op);}
// Preserve Javasm's 18 color categories. Fix omitted floating negation and misplaced
// integer negation/arraylength; keep shifts, casts and comparisons in their original families.
const dark=['A6B0BF','82B8F0','D5A5F5','F493A6','EDAC76','E6CB83','9CB0F3','8ECDAD','B6CD7B','E39CD4','90CFD6','D9BC92','B8AAF0','8BC8BD','B5D18C','F1B69A','DCA6BD','B2BDD9'];
const light=['566274','245C99','773B9B','A0224C','92471D','745A08','454D9B','226345','49620F','903776','166570','725128','604399','216857','52651F','934326','8C405D','4F5B82'];
const accents:Record<string,string>={'jal-night':'81C7BE',darcula:'CCAA83','vs-dark':'9CDCFE',vs:'005FB8','japan-dark':'96B9FF','japan-light':'193C87','hitachi-dark':'8EC2D6','hitachi-light':'235A79','ntt-dark':'78BAFF','ntt-light':'0058B3'};
export function instructionColors(theme:string):Record<InstructionGroup,string>{
 const isLight=theme==='vs'||theme==='hc-light'||theme.endsWith('-light');
 const palette=isLight?light:dark,accent=accents[theme];
 return Object.fromEntries(groupNames.map((g,i)=>{const color=palette[i];if(!accent)return [g,color];
  const tint=[0,2,4].map(n=>Math.round(parseInt(color.slice(n,n+2),16)*.9+parseInt(accent.slice(n,n+2),16)*.1).toString(16).padStart(2,'0')).join('');return [g,tint];
 })) as Record<InstructionGroup,string>;
}
export function instructionColorRules(theme:string){const colors=instructionColors(theme);return groupNames.map(group=>({token:'keyword.instruction.'+group.replaceAll('_','-'),foreground:colors[group]}));}
