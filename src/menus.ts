interface Item {id:string;label:string;shortcut?:string;action:()=>void}
interface Menu {label:string;items:Item[]}
export function installMenus(container:HTMLElement,definitions:Menu[]) {
  const buttons:HTMLButtonElement[]=[],panels:HTMLDivElement[]=[],items=new Map<string,HTMLButtonElement>();let open=-1;
  const enabled=(i:number)=>Array.from(panels[i].querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([hidden])'));
  function close(focus=false){if(open<0)return;const old=open;panels[old].hidden=true;buttons[old].setAttribute('aria-expanded','false');open=-1;if(focus)buttons[old].focus();}
  function show(i:number,focus=false,last=false){close();open=i;panels[i].hidden=false;buttons[i].setAttribute('aria-expanded','true');buttons.forEach((b,n)=>b.tabIndex=n===i?0:-1);if(focus){const rows=enabled(i);rows[last?rows.length-1:0]?.focus();}}
  definitions.forEach((menu,i)=>{
    const wrapper=document.createElement('div');wrapper.className='menu';wrapper.setAttribute('role','none');
    const button=document.createElement('button');button.id='menu-'+menu.label.toLowerCase();button.textContent=menu.label;button.setAttribute('role','menuitem');button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.tabIndex=i? -1:0;
    const panel=document.createElement('div');panel.className='menu-popup';panel.id='popup-'+menu.label.toLowerCase();panel.hidden=true;panel.setAttribute('role','menu');panel.setAttribute('aria-labelledby',button.id);button.setAttribute('aria-controls',panel.id);
    buttons.push(button);panels.push(panel);
    button.onclick=()=>{if(open===i)close();else show(i,true);};button.onpointerenter=()=>{if(open>=0&&open!==i)show(i);};
    button.onkeydown=e=>{
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();show(i,true,e.key==='ArrowUp');}
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='Home'||e.key==='End'){e.preventDefault();const n=buttons.length;const next=e.key==='Home'?0:e.key==='End'?n-1:(i+(e.key==='ArrowRight'?1:n-1))%n;if(open>=0)show(next,true);else{buttons.forEach((b,j)=>b.tabIndex=j===next?0:-1);buttons[next].focus();}}
    };
    for(const item of menu.items){const b=document.createElement('button');b.id=item.id;b.type='button';b.setAttribute('role','menuitem');b.tabIndex=-1;const label=document.createElement('span');label.textContent=item.label;b.append(label);if(item.shortcut){const k=document.createElement('kbd');k.textContent=item.shortcut;b.append(k);}b.onclick=()=>{close();item.action();};panel.append(b);items.set(item.id,b);}
    panel.onkeydown=e=>{
      const rows=enabled(i),at=rows.indexOf(document.activeElement as HTMLButtonElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();rows[e.key==='Home'?0:e.key==='End'?rows.length-1:(at+(e.key==='ArrowDown'?1:rows.length-1))%rows.length]?.focus();}
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show((i+(e.key==='ArrowRight'?1:buttons.length-1))%buttons.length,true);}
    };
    wrapper.append(button,panel);container.append(wrapper);
  });
  container.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close(true);}if(e.key==='Tab')close(true);});
  document.addEventListener('pointerdown',e=>{if(!container.contains(e.target as Node))close();});
  container.addEventListener('focusout',e=>{if(e.relatedTarget instanceof Node && !container.contains(e.relatedTarget))close();});
  return {hidden(id:string,value:boolean){items.get(id)!.hidden=value;},disabled(id:string,value:boolean){items.get(id)!.disabled=value;}};
}
