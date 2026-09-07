import {formatFrameValue} from './frame-value';
import './frame-transition.css';
export interface FrameTransition {
 before:string[];after:string[];consumed:number;produced:number;
 tail?:boolean;terminal?:string;note?:string;
 locals?:{before:string[];after:string[];labels?:string[];changed?:number[];effect?:string};
}
// Values enter bottom-to-top; both the live frame and dictionary examples use this renderer.
export function renderFrameTransition(frame:FrameTransition){
 const node=(tag:string,text?:string,cls?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const root=node('div',undefined,'frame-transition');
 function pair(before:string[],after:string[],locals=false){
  const grid=node('div',undefined,'frame-pair');
  [before,after].forEach((values,side)=>{
   if(side)grid.append(node('span','→','frame-arrow'));
   const col=node('section',undefined,'frame-column'),body=node('div',undefined,'frame-values');col.append(node('h4',side?'実行後':'実行前'),body);
   const terminal=side===1&&!locals&&frame.terminal;
   if(terminal)body.append(node('div',terminal,'frame-terminal'));
   else{
    const order=values.map((_,i)=>i);if(!locals)order.reverse();const visible=order.slice(0,8);
    if(!values.length)body.append(node('div',locals?'未設定':'空','frame-empty'));
    for(const index of visible){
     const changed=locals?(frame.locals?.changed??values.map((_,i)=>i)).includes(index):index>=values.length-(side?frame.produced:frame.consumed);
     const row=node('div',undefined,'frame-row'),value=node('div',undefined,'frame-value'+(changed?(side?' is-produced':' is-consumed'):''));
     value.append(node('code',formatFrameValue(values[index])));if(changed)value.title=side?'追加・更新される値':'消費・更新される値';
     if(locals)row.append(node('small',frame.locals?.labels?.[index]??'#'+index,'frame-marker'));else if(index===values.length-1)row.append(node('small','TOP','frame-marker'));
     row.append(value);body.append(row);
    }
    if(!locals&&(frame.tail||order.length>visible.length))body.append(node('div','⋯','frame-rest'));
   }
   grid.append(col);
  });return grid;
 }
 root.append(node('h3','スタック'),pair(frame.before,frame.after));
 if(frame.locals){root.append(node('h3','ローカル変数'),pair(frame.locals.before,frame.locals.after,true));if(frame.locals.effect)root.append(node('p',frame.locals.effect,'frame-note'));}
 if(frame.note)root.append(node('p',frame.note,'frame-note'));
 return root;
}
