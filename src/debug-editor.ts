import * as monaco from './editor-platform';
import type {DebugState} from './debug-protocol';
export function installDebugEditor(editor:monaco.editor.IStandaloneCodeEditor,state:()=>DebugState|undefined,toggle:(uri:string,line:number)=>void,uriForClass:(name:string)=>string|undefined){
 const decorations=editor.createDecorationsCollection();
 const update=()=>{const model=editor.getModel();if(!model)return;const current=state(),uri=model.uri.toString();const items:monaco.editor.IModelDeltaDecoration[]=(current?.breakpoints??[]).filter(b=>b.uri===uri).map(b=>({range:new monaco.Range(b.line,1,b.line,1),options:{glyphMarginClassName:'debug-breakpoint',glyphMarginHoverMessage:{value:'ブレークポイント'},stickiness:monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges}}));
 const f=current?.status==='paused'?current.snapshot?.frames[0]:undefined;
 if(f&&f.line>0&&uriForClass(f.className)===uri)items.push({range:new monaco.Range(f.line,1,f.line,1),options:{isWholeLine:true,className:'debug-current-line',glyphMarginClassName:'debug-current-glyph'}});
 decorations.set(items);
 };
 editor.updateOptions({glyphMargin:true});
 const click=editor.onMouseDown(e=>{if(e.target.type===monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN&&e.target.position&&editor.getModel())toggle(editor.getModel()!.uri.toString(),e.target.position.lineNumber);});
 const model=editor.onDidChangeModel(update);
 const action=editor.addAction({id:'jaspera.toggleBreakpoint',label:'ブレークポイントを切り替える',keybindings:[monaco.KeyCode.F9],contextMenuGroupId:'debug',run:e=>{const m=e.getModel(),p=e.getPosition();if(m&&p)toggle(m.uri.toString(),p.lineNumber);}});
 return {update,dispose(){click.dispose();model.dispose();action.dispose();decorations.clear();}};
}
