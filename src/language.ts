import {inlayHintColors} from './inlay-hint-style';
import {instructionHighlightGroups,instructionColorRules} from './instruction-colors';
import * as monaco from './editor-platform';
import { instructionCategory } from './instruction-categories';
import language from './generated/language-core.json';
import { completeOperand, consoleCompletions, type Member, type Catalog } from './completion';
export const instructionNames = language.instructions;
const snippets: Record<string,string> = {
  getstatic: 'getstatic ${1:java/lang/System}->${2:out}:${3:Ljava/io/PrintStream;}',
  invokevirtual: 'invokevirtual ${1:java/io/PrintStream}->${2:println}(${3:Ljava/lang/String;})${4:V}',
  invokestatic: 'invokestatic ${1:java/lang/Math}->${2:abs}(${3:I})${4:I}',
  invokespecial: 'invokespecial ${1:java/lang/Object}-><init>(${2:})V',
  invokeinterface: 'invokeinterface ${1:java/util/List}->${2:size}(${3:})${4:I}',
  ldc: 'ldc "${1:Hello, World!}"', iinc:'iinc ${1:1} ${2:1}', new:'new ${1:java/lang/StringBuilder}',
  newarray: 'newarray ${1:I}', bipush:'bipush ${1:10}', sipush:'sipush ${1:1000}'
};
let jdkPromise: Promise<Record<string,Member[]>> | undefined;
const getJdk = () => jdkPromise ??= import('./generated/jdk.json').then(m=>m.default as Record<string,Member[]>);
export function registerLanguage(workspaceCatalog:()=>Promise<Catalog>=async()=>({})) {
  monaco.languages.register({id:'jal',extensions:['.jal'],aliases:['JAL','JVM Assembly Language']});
  monaco.languages.setLanguageConfiguration('jal',{
    comments:{lineComment:'//',blockComment:['/*','*/']}, brackets:[['{','}'],['(',')']],
    autoClosingPairs:[{open:'{',close:'}'},{open:'(',close:')'},{open:'"',close:'"',notIn:['string','comment']}],
    wordPattern:/[a-zA-Z_$][\w$]*/, indentationRules:{increaseIndentPattern:/\{\s*(\/\/.*)?$/,decreaseIndentPattern:/^\s*\}/}
  });
  monaco.languages.setMonarchTokensProvider('jal',{
    keywords:language.keywords,...instructionHighlightGroups,
    tokenizer:{root:[
      [/\/\*/, 'comment','@comment'],[/\/\/.*$/,'comment'],[/^\s*#\w+/,'keyword.directive'],
      [/"(?:[^"\\]|\\.)*"/,'string'],[/"/,'string','@string'],
      [/[a-zA-Z_$][\w$]*(?=\s*:(?![A-Z\[]))/,'type.identifier'],
      [/[a-zA-Z_$][\w$]*(?:\/[\w$]+)+/,'type'],
      [/<(?:clinit|init)>/,'function'],[/\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlL]?)\b/,'number'],
      [/[a-zA-Z_$][\w$]*/,{cases:{...Object.fromEntries(Object.keys(instructionHighlightGroups).map(group=>['@'+group,'keyword.instruction.'+group.replaceAll('_','-')])),'@keywords':'keyword','@default':'identifier'}}],
      [/->|[=:,~]/,'operator'],[/[{}()\[\]]/,'delimiter.bracket'],[/;/,'delimiter']
    ],comment:[[/[^/*]+/,'comment'],[/\*\//,'comment','@pop'],[/[/*]/,'comment']],
      string:[[/[^\\"]+/,'string'],[/\\./,'string.escape'],[/"/,'string','@pop']]}
  });
  monaco.languages.registerCompletionItemProvider('jal',{triggerCharacters:[' ','/','>','.'],async provideCompletionItems(model,position){
    const word=model.getWordUntilPosition(position);
    const range=new monaco.Range(position.lineNumber,word.startColumn,position.lineNumber,word.endColumn);
    const prefix=model.getLineContent(position.lineNumber).slice(0,position.column-1);
    const operand=prefix.match(/^\s*(getstatic|putstatic|getfield|putfield|invokevirtual|invokestatic|invokespecial|invokeinterface|new|anewarray|checkcast|instanceof)(?:\s+(.*)|$)$/);
    const lineStart=!operand && prefix.trim().match(/^[\w]*$/);
    const suggestions:monaco.languages.CompletionItem[]=[];
    if(lineStart) {
      const docs=(await import('./generated/language.json')).default.documents as Record<string,{title:string;markdown:string}>;
      for(const label of language.instructions.filter(i=>i!=='aload_4')) suggestions.push({label:{label,description:instructionCategory(label)},kind:monaco.languages.CompletionItemKind.Function,
        insertText:/^(getstatic|putstatic|getfield|putfield|invokevirtual|invokestatic|invokespecial|invokeinterface|new|anewarray|checkcast|instanceof)$/.test(label)?label+' ':snippets[label]??label,command:/^(get|put|invoke|new|anewarray|checkcast|instanceof)/.test(label)?{id:'editor.action.triggerSuggest',title:'オペランド補完'}:undefined,insertTextRules:monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,range,
        detail:docs[label]?.title,documentation:{value:docs[label]?.markdown??label},sortText:`0${label}`});
      for(const label of language.keywords) suggestions.push({label,kind:monaco.languages.CompletionItemKind.Keyword,insertText:label,range});
    }
    for(const match of model.getValue().matchAll(/^\s*([a-zA-Z_$][\w$]*):/gm)) suggestions.push({label:match[1],kind:monaco.languages.CompletionItemKind.Reference,insertText:match[1],range,detail:'ジャンプラベル'});
    for(const match of model.getValue().matchAll(/\[\s*->\s*([\w$]+)\s*\]/g)) suggestions.push({label:match[1],kind:monaco.languages.CompletionItemKind.Variable,insertText:match[1],range,detail:'ローカル変数'});
    const kinds={field:monaco.languages.CompletionItemKind.Field,method:monaco.languages.CompletionItemKind.Method,class:monaco.languages.CompletionItemKind.Class,snippet:monaco.languages.CompletionItemKind.Snippet};
    if(operand) {
      const opcode=operand[1],typed=operand[2]??'',bare=operand[2]===undefined;
      const start=bare?prefix.search(/\S/)+1:prefix.length-typed.length+1;
      const memberRange=new monaco.Range(position.lineNumber,start,position.lineNumber,word.endColumn);
      const input=bare?opcode:typed;
      const [workspace,jdk]=await Promise.all([workspaceCatalog(),getJdk()]);
      const candidates=[...completeOperand(opcode,typed,workspace,'ワークスペース'),...completeOperand(opcode,typed,jdk).filter(c=>!Object.hasOwn(workspace,c.label.split('->')[0]))];
      suggestions.length=0;
      candidates.forEach((c,i)=>suggestions.push({label:c.label,kind:kinds[c.kind],insertText:(bare?opcode+' ':'')+c.insertText,
        range:memberRange,detail:c.detail,filterText:input+' '+c.label,sortText:String(i).padStart(4,'0'),
        command:c.continue?{id:'editor.action.triggerSuggest',title:'メンバー補完'}:undefined}));
    } else if(/^\s*[\w$./]*$/.test(prefix)) {
      const typed=prefix.trim(),start=prefix.length-typed.length+1;
      const wholeRange=new monaco.Range(position.lineNumber,start,position.lineNumber,word.endColumn);
      consoleCompletions(typed).forEach((c,i)=>suggestions.push({label:c.label,kind:kinds[c.kind],insertText:c.insertText,
        insertTextRules:monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,range:wholeRange,
        filterText:typed+' '+c.label,sortText:'00'+i,detail:c.detail,documentation:{value:'```jal\n'+c.insertText.replace('${1:Hello, World!}','Hello, World!')+'\n```'}}));
    }
    return {suggestions,incomplete:true};
  }});
  monaco.editor.defineTheme('jal-night',{base:'vs-dark',inherit:true,rules:[...instructionColorRules('jal-night'),
    {token:'keyword.instruction',foreground:'81C7BE'},{token:'keyword',foreground:'BBA7EB'},
    {token:'string',foreground:'DCD29D'},{token:'comment',foreground:'717D8A'},
    {token:'type',foreground:'B8CBDF'},{token:'type.identifier',foreground:'DFA971'},{token:'number',foreground:'DFA971'}
  ],colors:{...inlayHintColors('#91a1b2'),'editor.background':'#151a21','editor.foreground':'#d7dce3','editorLineNumber.foreground':'#52606d','editor.lineHighlightBackground':'#1b222c','editor.selectionBackground':'#2a4957','editorCursor.foreground':'#8fddd0','editorWidget.background':'#202833'}});
}
