import './help.css';

function element<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string){
  const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;
}
function openHelp(title:string,content:Node[]){
  let dialog=document.querySelector<HTMLDialogElement>('#help-dialog');
  if(!dialog){dialog=element('dialog');dialog.id='help-dialog';document.body.append(dialog);}
  dialog.setAttribute('aria-labelledby','help-title');
  const heading=element('h2',title);heading.id='help-title';heading.tabIndex=-1;
  const form=element('form');form.method='dialog';
  const actions=element('div');actions.className='dialog-actions';actions.append(element('button','閉じる'));
  form.append(heading,...content,actions);dialog.replaceChildren(form);
  if(!dialog.open)dialog.showModal();heading.focus();
}
export function showHelpMessage(title:string,text:string){openHelp(title,[element('p',text)]);}

export function helpMenuItems(detached=false,canSave=()=>true){
  return [
    {id:'help-offline',label:'オフラインの準備…',action:()=>{void import('./offline').then(m=>m.openOfflinePreparation());}},
    ...(!detached?[{id:'help-project',label:'プロジェクト',action:()=>openHelp('プロジェクト',[
      element('p','プロジェクトは、設定ファイル（.jalprj）とソースをまとめたフォルダーです。File → フォルダーを開くから選んでください。'),
      element('p','実行するファイルは、File → プロジェクトのプロパティで変更できます。初期設定は src/Main.jal です。')
    ])}]:[]),
    {id:'help-shortcuts',label:'ショートカット',action:()=>{
      const mod=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl';
      const table=element('table');table.className='help-shortcuts';table.setAttribute('aria-label','ショートカット一覧');
      const body=element('tbody');table.append(body);
      const row=(label:string,...alternatives:string[][])=>{
        const tr=element('tr'),name=element('th',label),keys=element('td');name.scope='row';
        alternatives.forEach((chord,index)=>{
          if(index)keys.append(document.createTextNode(' / '));
          const group=element('span');group.className='help-key-group';
          chord.forEach((key,i)=>{if(i)group.append(document.createTextNode(' + '));group.append(element('kbd',key));});keys.append(group);
        });tr.append(name,keys);body.append(tr);
      };
      if(!detached||canSave())row('保存',[mod,'S']);
      row('開く',[mod,'O']);
      row('コードを整形',['Shift','Alt','F']);
      row('実行 / 停止',[mod,'Enter'],['F5']);
      row('補完',[mod,'Space']);
      row('クイックフィックス',[mod,'.']);
      row('検索',[mod,'F']);
      row('定義へ移動',['F12']);
      const hover=element('p','命令にマウスを重ねると、実行前後のスタックが表示されます。');
      const tabs=element('p');tabs.append(element('kbd','Alt'),' を押しながらタブをクリックすると、同じグループのほかのタブを閉じます。');
      const labels=element('p');labels.append(element('kbd','Shift'),' を押しながらラベルをクリックすると、定義または使用箇所へ移動します。');
      openHelp('ショートカット',[table,labels,hover,tabs]);
    }},
    {id:'help-about',label:'JALWeb について',action:()=>showHelpMessage('JALWeb','JVM Assembly Language（JAL）のコードを編集・実行できます。')}
  ];
}
