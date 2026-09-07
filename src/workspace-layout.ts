import type {FileView} from './project';
export const layoutSides=['project','source','output'] as const;
export const layoutPanels=['project','console','problems','instructions'] as const;
export type LayoutSide=typeof layoutSides[number];
export type LayoutPanel=typeof layoutPanels[number];
export interface DockLayout {order:Record<LayoutSide,LayoutPanel[]>;selected:Record<LayoutSide,LayoutPanel|null>;closed:LayoutPanel[];sizes:number[];swapped:boolean}
export interface WindowLayout {order?:string[];tabs:string[];panels:LayoutPanel[];active:string;views:Record<string,FileView>;left:number;top:number;width:number;height:number;wordWrap:boolean}
export interface WorkspaceLayout {order?:string[];version:1;tabs:{key:string;side:LayoutSide}[];selected:Partial<Record<LayoutSide,string>>;activeSide:LayoutSide;collapsedFolders:string[];dock:DockLayout;windows:WindowLayout[];views:Record<string,FileView>;wordWrap:boolean}
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const strings=(v:unknown,max=256):string[]=>Array.isArray(v)?[...new Set(v.filter((s):s is string=>typeof s==='string'&&s.length<=512))].slice(0,max):[];
const side=(v:unknown):v is LayoutSide=>layoutSides.includes(v as LayoutSide);
const panel=(v:unknown):v is LayoutPanel=>layoutPanels.includes(v as LayoutPanel);
const finite=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.round(Math.max(min,Math.min(max,v))):fallback;
export function readViews(value:unknown):Record<string,FileView>{
 const result:Record<string,FileView>=Object.create(null);if(!record(value))return result;
 for(const [key,v] of Object.entries(value).slice(0,256))if(key.length<=512&&record(v))result[key]={line:finite(v.line,1,1,10000000),column:finite(v.column,1,1,10000000),scrollTop:finite(v.scrollTop,0,0,100000000),scrollLeft:finite(v.scrollLeft,0,0,100000000)};
 return result;
}
// Layout is optional metadata: malformed or stale entries must never prevent opening sources.
export function readWorkspaceLayout(value:unknown):WorkspaceLayout|undefined{
 if(!record(value)||value.version!==1||!record(value.dock))return;
 const d=value.dock,seen=new Set<LayoutPanel>(),order={} as DockLayout['order'],selected={} as DockLayout['selected'];
 for(const s of layoutSides){order[s]=strings(d.order?.[s]).filter(panel).filter(n=>{if(seen.has(n))return false;seen.add(n);return true;});}
 for(const n of layoutPanels)if(!seen.has(n))order[n==='project'?'project':'output'].push(n);
 const closed=strings(d.closed).filter(panel);
 for(const s of layoutSides)selected[s]=panel(d.selected?.[s])&&order[s].includes(d.selected[s])&&!closed.includes(d.selected[s])?d.selected[s]:null;
 let sizes=[.17,.48,.35];if(Array.isArray(d.sizes)&&d.sizes.length===3&&d.sizes.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0)){const sum=d.sizes.reduce((a:number,b:number)=>a+b,0);if(Number.isFinite(sum))sizes=d.sizes.map((n:number)=>Math.max(.05,n/sum));}const sum=sizes.reduce((a,b)=>a+b,0);sizes=sizes.map(n=>n/sum);
 const keys=new Set<string>();const tabs:WorkspaceLayout['tabs']=[];
 if(Array.isArray(value.tabs))for(const t of value.tabs.slice(0,256))if(record(t)&&typeof t.key==='string'&&t.key.length<=512&&side(t.side)&&!keys.has(t.key)){keys.add(t.key);tabs.push({key:t.key,side:t.side});}
 const active:WorkspaceLayout['selected']={};for(const s of layoutSides)if(typeof value.selected?.[s]==='string'&&value.selected[s].length<=512)active[s]=value.selected[s];
 const windows:WindowLayout[]=[];const windowKeys=new Set<string>(),windowPanels=new Set<LayoutPanel>();
 if(Array.isArray(value.windows))for(const w of value.windows.slice(0,16))if(record(w)){
  const wt=strings(w.tabs).filter(k=>{if(windowKeys.has(k))return false;windowKeys.add(k);return true;}),wp=strings(w.panels).filter(panel).filter(n=>{if(windowPanels.has(n))return false;windowPanels.add(n);return true;});
  if(wt.length||wp.length)windows.push({...(Array.isArray(w.order)?{order:strings(w.order)}:{}),tabs:wt,panels:wp,active:typeof w.active==='string'&&w.active.length<=512?w.active:'',views:readViews(w.views),left:finite(w.left,0,-100000,100000),top:finite(w.top,0,-100000,100000),width:finite(w.width,900,320,10000),height:finite(w.height,680,240,10000),wordWrap:w.wordWrap===true});
 }
 return {...(Array.isArray(value.order)?{order:strings(value.order)}:{}),version:1,tabs,selected:active,activeSide:side(value.activeSide)?value.activeSide:'source',collapsedFolders:strings(value.collapsedFolders),dock:{order,selected,closed,sizes,swapped:d.swapped===true},windows,views:readViews(value.views),wordWrap:value.wordWrap===true};
}
