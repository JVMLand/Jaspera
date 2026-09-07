import {inlayHintColors} from './inlay-hint-style';
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api';
// Original JALWeb palettes inspired by the user-provided reference images.
// These are visual interpretations, not themes supplied by the named companies.
// Tsukuba palettes interpret Classic Purple and Future Blue for screen contrast.
// https://futureship.sec.tsukuba.ac.jp/download_file/view/220/289
export const referenceThemes=[
 {id:'tsukuba-light',label:'Tsukuba Light',dark:false,palette:['#fdfcfe','#f1eef4','#d3ccd9','#332d3c','#726878','#6600cc','#e8e0ef','#6600cc','#ffffff','#a82d4b','#805c22'],syntax:['#663b91','#346252','#865e37','#817589','#326d7b','#83577e']},
 {id:'tsukuba-night',label:'Tsukuba Night',dark:true,palette:['#1c1922','#26212e','#494050','#e1dae8','#b0a3bd','#b395d2','#3b3048','#6600cc','#ffffff','#eaa0af','#d5bd90'],syntax:['#b99ad5','#a0bcae','#d6b791','#9d8da9','#96bcc6','#c5a0c1']},
 {id:'japan-light',label:'Japan Light',dark:false,palette:['#ffffff','#eeeeef','#b5b8c5','#202533','#555e70','#193c87','#dce5f7','#153c85','#ffffff','#b02030','#785800'],syntax:['#173b8d','#386333','#864500','#646b77','#325d86','#792d65']},
 {id:'hitachi-light',label:'Hitachi Light',dark:false,palette:['#ffffff','#f5f6f7','#d0d7de','#202a33','#596773','#235a79','#e0ecf0','#294b5e','#ffffff','#ad293e','#806000'],syntax:['#244f70','#326545','#92572e','#65747e','#206f76','#79416e']},
 {id:'hitachi-dark',label:'Hitachi Dark',dark:true,palette:['#151d24','#202c35','#435461','#e2e9ed','#aab9c3','#8ec2d6','#304653','#3d667b','#ffffff','#ff9d9b','#e1c284'],syntax:['#9dcbdc','#b4cea0','#e8b38a','#9dadb7','#92cdc1','#c5b1de']},
 {id:'vibe-night',label:'Vibe Night',dark:true,palette:['#100e24','#191530','#484066','#ede9ff','#b1aacd','#80e8ff','#343064','#9671ff','#100823','#ff99bc','#fbd18c'],syntax:['#c5a0ff','#8ceac4','#ffd18e','#a49aba','#89ddff','#f2a8ef']},
 {id:'vibe-light',label:'Vibe Light',dark:false,palette:['#fcfaff','#f1ebfc','#d6c7eb','#302044','#756288','#713bd0','#e7dafa','#7547d4','#ffffff','#b42663','#845500'],syntax:['#7437b2','#256b52','#925019','#806c94','#25667f','#a13885']},
 {id:'denden-night',label:'DenDen Night',dark:true,palette:['#0c192d','#122640','#354f70','#e0edff','#a0b8d8','#78baff','#1c3d63','#236cb3','#ffffff','#ff9aaf','#eacb86'],syntax:['#8dc6ff','#9bd8b1','#efc18c','#95aecf','#86d8ec','#ccadf0']},
 {id:'denden-light',label:'DenDen Light',dark:false,palette:['#ffffff','#f5f8fc','#dde5ef','#172f50','#526886','#0757ad','#eaf1fb','#0757ad','#ffffff','#b32242','#805a00'],syntax:['#0056b3','#28663e','#8e4d13','#637792','#086d83','#7747a6']},
 {id:'googol-night',label:'Googol Night',dark:true,palette:['#202124','#292a2d','#45474b','#e8eaed','#b0b5be','#a8c7fa','#334567','#a8c7fa','#162a49','#f28b82','#fdd663'],syntax:['#8ab4f8','#81c995','#fdd663','#a1a7af','#78d9ec','#c58af9']},
 {id:'googol-light',label:'Googol Light',dark:false,palette:['#ffffff','#f5f7fc','#dce1e8','#202124','#5f6368','#1967d2','#e8f0fe','#1967d2','#ffffff','#b3261e','#795500'],syntax:['#185abc','#188038','#915500','#6c737d','#087c86','#8430aa']},
 {id:'entrance-night',label:'Entrance Night',dark:true,palette:['#202020','#292929','#454545','#f3f2f1','#b6b4b2','#60baff','#163c55','#0078d4','#ffffff','#ff9999','#efcd80'],syntax:['#79c4f5','#a7d19a','#e6b57d','#a3a19f','#74d3db','#ceaae8']},
 {id:'entrance-light',label:'Entrance Light',dark:false,palette:['#ffffff','#eae9e8','#d2d0ce','#242424','#605e5c','#006cbe','#e4f2fb','#0078d4','#ffffff','#a4262c','#835b00'],syntax:['#0068b8','#39712f','#965715','#77736f','#007c86','#8250a2']}

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
 ],colors:{...inlayHintColors(muted),'editor.background':bg,'editor.foreground':text,'editorLineNumber.foreground':muted,
  'editorLineNumber.activeForeground':accent,'editorCursor.foreground':accent,'editor.selectionBackground':selection,
  'editor.lineHighlightBackground':surface,'editorWidget.background':surface,'editorWidget.foreground':text,
  'editorWidget.border':border,'editorSuggestWidget.selectedBackground':selection,
  'editorSuggestWidget.highlightForeground':accent,'editorHoverWidget.background':surface,
  'editorHoverWidget.foreground':text,'editorHoverWidget.border':border,'editorError.foreground':error,
  'editorWarning.foreground':warning,'focusBorder':accent,'input.background':bg,'input.foreground':text,
  'input.border':border,'list.activeSelectionBackground':selection,'list.activeSelectionForeground':text}};
}
