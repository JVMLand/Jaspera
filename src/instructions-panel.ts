import {installContextMenu,copyText,selectedText} from './context-menu';
import {renderFrameTransition} from './frame-transition';
import {instructionHighlightGroup} from './instruction-colors';
import {renderMarkdown} from 'monaco-editor/esm/vs/base/browser/markdownRenderer';
import {categories,instructionList,guide,type Diagram} from './instruction-guide';
import './instructions-panel.css';
export function installInstructionsPanel(host:HTMLElement){
 const el=(tag:string,text?:string,className?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 const toolbar=el('div',undefined,'instruction-search'),search=document.createElement('input'),category=document.createElement('select');search.type='search';search.placeholder='命令名・説明で検索';search.setAttribute('aria-label','命令を検索');category.setAttribute('aria-label','命令カテゴリ');
 for(const value of ['',...categories]){const o=document.createElement('option');o.value=value;o.textContent=value||'すべてのカテゴリ';category.append(o);}toolbar.append(search);
 const count=el('p','', 'instruction-count'),list=el('nav',undefined,'instruction-index'),detail=el('article',undefined,'instruction-detail');list.setAttribute('aria-label','カテゴリ別の命令一覧');count.setAttribute('aria-live','polite');const chooser=el('div',undefined,'instruction-chooser');chooser.hidden=true;chooser.append(category,count,list);toolbar.append(chooser);const body=el('div',undefined,'instruction-body');body.append(detail);host.append(toolbar,body);search.setAttribute('aria-expanded','false');
 const resize=new ResizeObserver(()=>{chooser.style.maxHeight=Math.max(80,Math.min(400,host.clientHeight-toolbar.offsetHeight-8))+'px';});resize.observe(host);
 function toggle(open:boolean){chooser.style.maxHeight=Math.max(80,Math.min(400,host.clientHeight-toolbar.offsetHeight-8))+'px';chooser.hidden=!open;search.setAttribute('aria-expanded',String(open));}
 const outside=(e:PointerEvent)=>{if(!toolbar.contains(e.target as Node))toggle(false);};document.addEventListener('pointerdown',outside,true);search.onclick=()=>toggle(true);search.onkeydown=e=>{if(e.key==='Escape')toggle(false);if(e.key==='ArrowDown'){toggle(true);list.querySelector<HTMLButtonElement>('button')?.focus();e.preventDefault();}};
 const entries=instructionList.map(guide);let selected='iadd',markdown:ReturnType<typeof renderMarkdown>|undefined;
 function comparison(form:Diagram){
  const terminal=form.after.includes('メソッド終了')?'メソッド終了':undefined;
  const labels=form.locals?.before.map(v=>v.match(/^(#[^:]+):/)?.[1]??'');
  const localValues=(values:string[])=>values.map(v=>v.replace(/^#[^:]+:\s*/,''));
  return renderFrameTransition({before:form.before,after:terminal?[]:form.after,consumed:form.before.length,produced:form.after.length,tail:!terminal,terminal,note:form.note,
   locals:form.locals?{before:localValues(form.locals.before),after:localValues(form.locals.after),labels}:undefined});
 }

 function show(op:string){
  selected=op;detail.style.setProperty('--instruction-color',`var(--instruction-${instructionHighlightGroup(op)})`);markdown?.dispose();detail.replaceChildren();const entry=entries.find(e=>e.op===op)!;
  for(const button of list.querySelectorAll<HTMLButtonElement>('button'))button.setAttribute('aria-pressed',String(button.dataset.op===op));
  const header=el('header');header.append(el('span',entry.category,'instruction-eyebrow'),el('h2',op),el('p',entry.title,'instruction-title'));detail.append(header,el('p',entry.summary,'instruction-summary'));
  if(entry.forms.some(f=>/long|double|カテゴリ2/.test([...f.before,...f.after,f.note??''].join(' '))))detail.append(el('p','カテゴリ2の long / double は1つの値で2スロットを使います。カテゴリ1の int / float / 参照は1スロットです。','instruction-category-note'));
  detail.append(el('h3',entry.example===op?'命令':'書き方の例'),el('pre',entry.example,'instruction-example'));
  const diagram=el('div');if(entry.forms.length>1){const select=document.createElement('select');select.setAttribute('aria-label','スタックの形式');entry.forms.forEach((form,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=form.label;select.append(o);});select.onchange=()=>diagram.replaceChildren(comparison(entry.forms[Number(select.value)]));detail.append(select);}
  if(entry.forms.length)diagram.append(comparison(entry.forms[0]));else diagram.append(el('p','この命令の前後状態は、下の「スタック効果」で確認できます。'));detail.append(diagram);
  const advanced=el('div',undefined,'instruction-advanced');
  markdown=renderMarkdown({value:entry.markdown,isTrusted:false,supportHtml:false});
  for(const anchor of markdown.element.querySelectorAll<HTMLAnchorElement>('a[data-href]')){const href=anchor.dataset.href!;if(/^https:\/\//.test(href)){anchor.href=href;anchor.target='_blank';anchor.rel='noopener noreferrer';}}
  advanced.append(markdown.element);if(entry.markdown.trim())detail.append(advanced);
  const link=document.createElement('a');link.textContent='JVM 仕様書で命令を確認 ↗';link.href='https://docs.oracle.com/javase/specs/jvms/se23/html/jvms-6.html#jvms-6.5.'+op.replace(/^([ilfd])const_(?:m1|[0-5])$/, '$1const_$1').replace(/_([0-3])$/, '_n').replace(/^([fd])cmp[lg]$/, '$1cmp_op').replace(/^if_([ai])cmp(?:eq|ne|lt|ge|gt|le)$/, 'if_$1cmp_cond').replace(/^if(?:eq|ne|lt|ge|gt|le)$/, 'if_cond');link.target='_blank';link.rel='noopener noreferrer';detail.append(link);detail.scrollTop=0;
 }
 function filter(){
  const query=search.value.toLocaleLowerCase().trim(),found=entries.filter(e=>(!category.value||e.category===category.value)&&(!query||(e.op+' '+e.title+' '+e.summary).toLocaleLowerCase().includes(query)));list.replaceChildren();count.textContent=found.length+' / '+entries.length+' 命令';
  if(!found.length){list.append(el('p','該当する命令がありません。検索語やカテゴリを変えてください。'));detail.hidden=true;return;}detail.hidden=false;
  for(const name of categories){const group=found.filter(e=>e.category===name);if(!group.length)continue;const folder=document.createElement('details');folder.open=!!query||!!category.value||group.some(e=>e.op===selected);folder.append(el('summary',name+' · '+group.length));const buttons=el('div',undefined,'instruction-buttons');for(const entry of group){const b=document.createElement('button');b.type='button';b.dataset.op=entry.op;b.style.color=`var(--instruction-${instructionHighlightGroup(entry.op)})`;b.textContent=entry.op;b.title=entry.title;b.onclick=()=>show(entry.op);buttons.append(b);}folder.append(buttons);list.append(folder);}
  show(found.some(e=>e.op===selected)?selected:found[0].op);
 }
 const context=installContextMenu(host,target=>{const op=target.closest<HTMLElement>('[data-op]')?.dataset.op??selected,entry=entries.find(e=>e.op===op)!;const selection=selectedText(detail);return [
  {label:'命令名をコピー',action:()=>copyText(op)},
  {label:'書き方の例をコピー',action:()=>copyText(entry.example)},
  {label:'選択範囲をコピー',disabled:!selection,action:()=>copyText(selection)},null,
  {label:'命令を検索',action:()=>{search.focus();toggle(true);}}
 ];});
 search.oninput=()=>{toggle(true);filter();};category.onchange=filter;filter();return {showInstruction(op:string){if(!instructionList.includes(op))return;selected=op;search.value='';category.value='';filter();toggle(false);},dispose(){context.dispose();resize.disconnect();document.removeEventListener('pointerdown',outside,true);markdown?.dispose();}};
}
