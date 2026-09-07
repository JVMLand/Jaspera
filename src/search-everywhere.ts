import type {SearchTarget} from './navigation';
import type {Catalog} from './completion';
import './search-everywhere.css';
let jdk:Promise<SearchTarget[]>|undefined;
function library(){return jdk??=import('./generated/jdk.json').then(module=>{
 const targets:SearchTarget[]=[];
 for(const [owner,members] of Object.entries(module.default as Catalog)){
  const detail=owner.replaceAll('/','.');
  targets.push({kind:'class',label:owner.split('/').pop()!,detail,owner});
  for(const member of members){const split=member.kind==='field'?member.name.indexOf(':'):member.name.indexOf('(');
   targets.push({kind:member.kind,label:member.name,detail,owner,name:member.name.slice(0,split),descriptor:member.name.slice(split+(member.kind==='field'?1:0))});
  }
 }
 return targets;
}).catch(error=>{jdk=undefined;throw error;});}
const normalize=(value:string)=>value.toLowerCase().replace(/->|\//g,'.');
export function searchTargets(targets:SearchTarget[],query:string){
 const words=normalize(query.trim()).split(/\s+/).filter(Boolean);
 return targets.map((target,index)=>{
  const name=normalize(target.label),full=normalize(target.detail+'.'+target.label);
  const matches=words.every(word=>full.includes(word));
  const score=!matches?Infinity:!words.length?(target.kind==='file'?0:10):name===words.join(' ')?0:name.startsWith(words.join(' '))?1:2;
  return {target,index,score};
 }).filter(row=>Number.isFinite(row.score)).sort((a,b)=>a.score-b.score||a.index-b.index).slice(0,100).map(row=>row.target);
}
export function installSearchEverywhere(workspace:()=>Promise<SearchTarget[]>,open:(target:SearchTarget)=>Promise<()=>void|Promise<void>>){
 const dialog=document.createElement('dialog');dialog.className='search-everywhere';dialog.setAttribute('aria-label','どこでも検索');
 dialog.innerHTML='<header><h1>どこでも検索</h1><button type="button" aria-label="閉じる">×</button></header><input type="search" placeholder="ファイル・クラス・メソッド・フィールドを検索" aria-label="ファイル・定義を検索" role="combobox" aria-autocomplete="list" aria-controls="everywhere-results" aria-expanded="true"><p role="status" aria-live="polite"></p><div id="everywhere-results" role="listbox"></div><footer><kbd>↑</kbd> <kbd>↓</kbd> 選択　<kbd>Enter</kbd> 開く　<kbd>Esc</kbd> 閉じる</footer>';
 document.body.append(dialog);
 const input=dialog.querySelector('input')!,list=dialog.querySelector<HTMLDivElement>('[role=listbox]')!,status=dialog.querySelector('p')!;
 let all:SearchTarget[]=[],rows:SearchTarget[]=[],selected=0,version=0,timer:ReturnType<typeof setTimeout>|undefined,opening=false,previous:HTMLElement|null=null;
 const highlight=()=>{for(const [i,child] of [...list.children].entries())child.setAttribute('aria-selected',String(i===selected));input.setAttribute('aria-activedescendant','everywhere-'+selected);list.children[selected]?.scrollIntoView({block:'nearest'});};
 const render=()=>{rows=searchTargets(all,input.value);selected=0;list.replaceChildren();for(const [i,target] of rows.entries()){
  const row=document.createElement('div');row.id='everywhere-'+i;row.setAttribute('role','option');
  const kind=document.createElement('span');kind.className='search-kind';kind.textContent={file:'ファイル',class:'クラス',method:'メソッド',field:'フィールド'}[target.kind];
  const title=document.createElement('strong');title.textContent=target.label;const detail=document.createElement('small');detail.textContent=target.detail;
  row.append(kind,title,detail);row.onclick=()=>{selected=i;void choose();};list.append(row);
 }status.textContent=rows.length?`${rows.length} 件${rows.length===100?'（上位100件）':''}`:'見つかりませんでした。';highlight();};
 async function choose(){const target=rows[selected];if(!target||opening)return;opening=true;const current=version;status.textContent='定義を開いています…';try{const reveal=await open(target);if(current===version){dialog.close('opened');await reveal();}}catch(error){if(current===version)status.textContent=error instanceof Error?error.message:'開けませんでした。';}finally{opening=false;}}
 async function show(){if(dialog.open||document.querySelector('dialog[open]'))return;previous=document.activeElement as HTMLElement;input.value='';all=[];list.replaceChildren();status.textContent='検索の準備中…';dialog.showModal();input.focus();const current=++version;
  const results=await Promise.allSettled([workspace(),library()]);if(current!==version||!dialog.open)return;
  all=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);render();if(results.some(result=>result.status==='rejected'))status.textContent='一部の検索対象を読み込めませんでした。閉じてからもう一度お試しください。';
 }
 dialog.querySelector('button')!.onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(dialog.open)return;clearTimeout(timer);timer=undefined;++version;all=[];rows=[];list.replaceChildren();if(dialog.returnValue!=='opened')previous?.focus();dialog.returnValue='';});
 input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{timer=undefined;render();},100);};
 input.onkeydown=event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();return;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();selected=Math.max(0,Math.min(rows.length-1,selected+(event.key==='ArrowDown'?1:-1)));highlight();}else if(event.key==='Enter'){event.preventDefault();clearTimeout(timer);if(timer){render();timer=undefined;}void choose();}};
 let last=0,down=false,alone=false;
 const keydown=(event:KeyboardEvent)=>{if(event.key==='Shift'){if(!event.repeat){down=true;alone=!event.ctrlKey&&!event.altKey&&!event.metaKey;}}else{alone=false;last=0;}};
 const keyup=(event:KeyboardEvent)=>{if(event.key!=='Shift')return;if(down&&alone){const now=performance.now();if(last&&now-last<450){last=0;void show();}else last=now;}down=false;alone=false;};
 const reset=()=>{last=0;down=false;alone=false;};
 window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);window.addEventListener('blur',reset);window.addEventListener('pointerdown',reset,true);
 return {show,dispose(){++version;clearTimeout(timer);window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',reset);window.removeEventListener('pointerdown',reset,true);dialog.remove();}};
}
