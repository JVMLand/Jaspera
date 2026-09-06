import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
// Mouse clicks only: cursor navigation and selection drags must not change the dictionary.
export function followInstructionClicks(editor:monaco.editor.IStandaloneCodeEditor,show:(op:string)=>void){
 let down:{x:number;y:number}|undefined;
 const start=editor.onMouseDown(e=>{down=e.event.leftButton&&!e.event.shiftKey&&!e.event.altKey&&!e.event.ctrlKey&&!e.event.metaKey?{x:e.event.posx,y:e.event.posy}:undefined;});
 const end=editor.onMouseUp(e=>{const at=down;down=undefined;if(!at||Math.hypot(e.event.posx-at.x,e.event.posy-at.y)>4||e.target.type!==monaco.editor.MouseTargetType.CONTENT_TEXT)return;const model=editor.getModel(),position=e.target.position;if(!model||!position)return;const word=model.getWordAtPosition(position);if(!word||position.column>=word.endColumn)return;
  const tokens=monaco.editor.tokenize(model.getValue(),'jal')[position.lineNumber-1],offset=position.column-1;const token=tokens.find((t,i)=>t.offset<=offset&&(tokens[i+1]?.offset??Infinity)>offset);if(token?.type.startsWith('keyword.instruction.'))show(word.word);
 });return {dispose(){start.dispose();end.dispose();}};
}
