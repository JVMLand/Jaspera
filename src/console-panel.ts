import {installContextMenu,copyText,selectedText} from './context-menu';
export function installConsoleContextMenu(host:HTMLElement,output:HTMLElement,clear:()=>void){
 return installContextMenu(host,()=>{const selection=selectedText(output),text=output.textContent??'';return [
  {label:'選択範囲をコピー',disabled:!selection,action:()=>copyText(selection)},
  {label:'出力をすべてコピー',disabled:!text,action:()=>copyText(text)},
  {label:'出力をすべて選択',disabled:!text,action:()=>{const range=document.createRange();range.selectNodeContents(output);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);}},null,
  {label:'コンソールを消去',disabled:!text,action:clear}
 ];});
}
