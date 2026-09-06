import type { editor } from 'monaco-editor/esm/vs/editor/editor.api';
// Original JALWeb palettes inspired by the three user-provided reference images.
// These are visual interpretations, not themes supplied by the named companies.
export const referenceThemes=[
 {id:'japan-light',label:'Japan Light',dark:false,palette:['#ffffff','#eeeeef','#b5b8c5','#202533','#555e70','#193c87','#dce5f7','#153c85','#ffffff','#b02030','#785800'],syntax:['#173b8d','#386333','#864500','#646b77','#325d86','#792d65']},
 {id:'japan-dark',label:'Japan Dark',dark:true,palette:['#141b29','#202a3b','#485772','#e1e8f5','#aab8cf','#96b9ff','#2b4168','#365d9e','#ffffff','#ff9ca7','#e8c779'],syntax:['#a5beff','#b0cc8b','#edbe82','#97a8c1','#8bc9e8','#e2ace3']},
 {id:'hitachi-light',label:'Hitachi Light',dark:false,palette:['#ffffff','#f5f6f7','#d0d7de','#202a33','#596773','#235a79','#e0ecf0','#294b5e','#ffffff','#ad293e','#806000'],syntax:['#244f70','#326545','#92572e','#65747e','#206f76','#79416e']},
 {id:'hitachi-dark',label:'Hitachi Dark',dark:true,palette:['#151d24','#202c35','#435461','#e2e9ed','#aab9c3','#8ec2d6','#304653','#3d667b','#ffffff','#ff9d9b','#e1c284'],syntax:['#9dcbdc','#b4cea0','#e8b38a','#9dadb7','#92cdc1','#c5b1de']},
 {id:'ntt-light',label:'NTT Light',dark:false,palette:['#ffffff','#f4f8fd','#c9d8ec','#152a49','#526886','#0058b3','#dfedff','#0055a8','#ffffff','#b32242','#805a00'],syntax:['#0056b3','#28663e','#8e4d13','#637792','#086d83','#7747a6']},
 {id:'ntt-dark',label:'NTT Dark',dark:true,palette:['#0c192d','#122640','#354f70','#e0edff','#a0b8d8','#78baff','#1c3d63','#236cb3','#ffffff','#ff9aaf','#eacb86'],syntax:['#8dc6ff','#9bd8b1','#efc18c','#95aecf','#86d8ec','#ccadf0']}
];
export function editorTheme(t:typeof referenceThemes[number]):editor.IStandaloneThemeData {
 const [bg,surface,border,text,muted,accent,selection,,,error,warning]=t.palette;
 const [keyword,string,number,comment,type,fn]=t.syntax;
 return {base:t.dark?'vs-dark':'vs',inherit:true,rules:[
  {token:'',foreground:text.slice(1)},{token:'identifier',foreground:text.slice(1)},
  {token:'keyword',foreground:keyword.slice(1)},{token:'keyword.instruction',foreground:keyword.slice(1)},
  {token:'string',foreground:string.slice(1)},{token:'number',foreground:number.slice(1)},
  {token:'comment',foreground:comment.slice(1)},{token:'type',foreground:type.slice(1)},
  {token:'type.identifier',foreground:fn.slice(1)},{token:'function',foreground:fn.slice(1)},
  {token:'delimiter',foreground:text.slice(1)},{token:'operator',foreground:text.slice(1)}
 ],colors:{'editor.background':bg,'editor.foreground':text,'editorLineNumber.foreground':muted,
  'editorLineNumber.activeForeground':accent,'editorCursor.foreground':accent,'editor.selectionBackground':selection,
  'editor.lineHighlightBackground':surface,'editorWidget.background':surface,'editorWidget.foreground':text,
  'editorWidget.border':border,'editorSuggestWidget.selectedBackground':selection,
  'editorSuggestWidget.highlightForeground':accent,'editorHoverWidget.background':surface,
  'editorHoverWidget.foreground':text,'editorHoverWidget.border':border,'editorError.foreground':error,
  'editorWarning.foreground':warning,'focusBorder':accent,'input.background':bg,'input.foreground':text,
  'input.border':border,'list.activeSelectionBackground':selection,'list.activeSelectionForeground':text}};
}
