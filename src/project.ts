import {readWorkspaceLayout,type WorkspaceLayout} from './workspace-layout';
import { hello } from './examples';
export interface FileView { line:number; column:number; scrollTop:number; scrollLeft:number }
export interface Project {
  name:string;
  files:{path:string;source:string}[];
  workspace:{layout?:WorkspaceLayout;activeFile:string;entryFile:string;stdin:string;panel:'project'|'console'|'problems'|'instructions';wordWrap:boolean;views:Record<string,FileView>};
}
const bytes=(s:string)=>new TextEncoder().encode(s).length;
function requireValue(value:unknown,message:string):asserts value { if(!value)throw new Error(message); }
export function validatePath(path:string) {
  requireValue(path.length<=240 && path.endsWith('.jal') && !/[\\:<>"|?*\x00-\x1f]/.test(path) && path.split('/').every(p=>p && p!=='.' && p!=='..' && p.trim()===p),'ファイル名は相対パスの .jal にしてください（例: src/Main.jal）。');
  return path;
}
export function validateProject(project:Project):Project {
  const data=project;
  requireValue(typeof data.name==='string' && data.name.trim().length>0 && data.name.length<=128,'プロジェクト名は 1〜128 文字にしてください。');
  requireValue(Array.isArray(data.files) && data.files.length<=64,'プロジェクトには 0〜64 個の JAL ファイルが必要です。');
  const names=new Set<string>();let total=0;
  const files=data.files.map((f:any)=>{
    requireValue(f && typeof f.path==='string' && typeof f.source==='string','ファイルの path と source が必要です。');
    validatePath(f.path);
    requireValue(!names.has(f.path.toLowerCase()),'同じファイル名が重複しています。'); names.add(f.path.toLowerCase());
    const size=bytes(f.source);total+=size;
    requireValue(size<=1024*1024 && total<=6*1024*1024,'ソースは各 1 MiB、合計 6 MiB 以下にしてください。');
    return {path:f.path as string,source:f.source as string};
  });
  const w=data.workspace??{};
  requireValue(typeof w==='object' && !Array.isArray(w),'workspace が不正です。');
  const activeFile=w.activeFile??files[0]?.path??'',entryFile=w.entryFile??files.find((f:{path:string})=>f.path==='Main.jal')?.path??files.find((f:{path:string})=>f.path.endsWith('/Main.jal'))?.path??files[0]?.path??'';
  requireValue(!files.length || files.some((f:{path:string})=>f.path===activeFile) && files.some((f:{path:string})=>f.path===entryFile),'開いているファイルまたは実行対象が見つかりません。');
  const stdin=w.stdin??'',panel=w.panel??'console',wordWrap=w.wordWrap??false;
  requireValue(typeof stdin==='string' && bytes(stdin)<=1024*1024,'標準入力は 1 MiB 以下にしてください。');
  requireValue(panel==='project'||panel==='console'||panel==='problems'||panel==='instructions','表示パネルが不正です。');
  requireValue(typeof wordWrap==='boolean','折り返し設定が不正です。');
  const views:Record<string,FileView>=Object.create(null);
  requireValue(!w.views || (typeof w.views==='object' && !Array.isArray(w.views)),'カーソル位置が不正です。');
  for(const f of files) {
    const v=w.views?.[f.path];if(!v)continue;
    requireValue((['line','column','scrollTop','scrollLeft'] as const).every(k=>Number.isSafeInteger(v[k]) && v[k]>=(k==='line'||k==='column'?1:0)),'カーソル位置が不正です。');
    views[f.path]={line:v.line,column:v.column,scrollTop:v.scrollTop,scrollLeft:v.scrollLeft};
  }
  return {name:data.name.trim(),files,workspace:{activeFile,entryFile,stdin,panel,wordWrap,views,...(w.layout?{layout:readWorkspaceLayout(w.layout)}:{})}};
}
export function defaultProject():Project { return {name:'Main',files:[{path:'src/Main.jal',source:hello}],workspace:{activeFile:'src/Main.jal',entryFile:'src/Main.jal',stdin:'',panel:'console',wordWrap:false,views:{}}}; }
