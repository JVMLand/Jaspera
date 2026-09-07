import {relatedInstructions} from './instruction-relations';
import {instructionDetails} from './instruction-details';
import language from './generated/language.json';
export const categories=['読み込み・保存と定数','算術・ビット演算','型変換','オブジェクト・配列・フィールド','スタック操作','比較・分岐','メソッド呼び出し・復帰','例外','同期','補助命令'] as const;
export function category(op:string):string {
 if(/^(?:[ilfda](?:load|store|const)|[bs]ipush|ldc)/.test(op))return categories[0];
 if(/^[ilfd](?:add|sub|mul|div|rem|neg|and|or|xor|shl|shr|ushr)$/.test(op)||op==='iinc')return categories[1];
 if(/^[ilfd]2/.test(op))return categories[2];
 if(/^(?:[ilfdabcs]a(?:load|store)|new|anewarray|multianewarray|arraylength|checkcast|instanceof|get|put)/.test(op))return categories[3];
 if(/^(pop|dup|swap)/.test(op))return categories[4];
 if(/^(if|goto|jsr|ret$|[lfd]cmp|table|lookup)/.test(op))return categories[5];
 if(/^(invoke|[ilfda]?return)/.test(op))return categories[6];
 if(op==='athrow')return categories[7];if(op.startsWith('monitor'))return categories[8];return categories[9];
}
export const instructionList=language.instructions.filter(op=>op!=='aload_4');
const types:Record<string,string>={i:'int',l:'long',f:'float',d:'double',a:'参照',b:'byte / boolean',c:'char',s:'short'};
export interface Diagram {label:string;before:string[];after:string[];note?:string;locals?:{before:string[];after:string[]}}
export function guide(op:string){
 const doc=(language.documents as Record<string,{title:string;markdown:string}>)[op];
 const markdown=doc.markdown;
 let summary=doc.title;
 const forms:Diagram[]=[],type=types[op[0]]??'値';let example=op;
 const add=(before:string[],after:string[],note?:string,locals?:Diagram['locals'],label='基本の形')=>forms.push({before,after,note,locals,label});
 let m=op.match(/^([ilfda])(load|store)(?:_(\d))?$/);
 if(m){const slot=m[3]??'N',value=`値 : ${type}`;example=m[3]?op:op+' 1';if(m[2]==='load'){summary=`ローカル変数 #${slot} の ${type} 値を，計算用のスタックの一番上へコピーします。`;add([], [value]);}else{summary=`スタックの一番上の ${type} 値を取り出し，ローカル変数 #${slot} に保存します。`;add([value],[],undefined,{before:[`#${slot}: 以前の値`],after:[`#${slot}: ${value}`]});}}
 else if(op==='iinc'){summary='ローカル変数の int 値に指定した数を足します。スタックを使わず，変数を直接更新します。';example='iinc 1 1';add([],[],'例では #1 を 1 増やします。',{before:['#1: 3 : int'],after:['#1: 4 : int']});}
 else if(/const_|^[bs]ipush$|^ldc/.test(op)){const v=op==='aconst_null'?'null':op.startsWith('ldc')?(op==='ldc2_w'?'定数 : long / double':'定数'):op.endsWith('m1')?'-1 : int':op.includes('const_')?op.split('_')[1]+' : '+type:'整数 : int';summary='指定した定数をスタックの一番上に積み，後の命令が使えるようにします。';example=/^[bs]ipush$/.test(op)?op+' 10':op.startsWith('ldc')?op+(op==='ldc2_w'?' 10L':' "Hello"'):op;add([],[v]);}
 else if(m=op.match(/^([ilfd])(add|sub|mul|div|rem|and|or|xor|shl|shr|ushr)$/)){
  const operation=m[2],symbols:Record<string,string>={add:'+',sub:'−',mul:'×',div:'÷',rem:'の余り',and:'AND',or:'OR',xor:'XOR',shl:'<<',shr:'>>',ushr:'>>>'};
  const descriptions:Record<string,string>={add:'加算',sub:'減算',mul:'乗算',div:'除算',rem:'割り算の余りを求める計算',and:'ビットごとの AND',or:'ビットごとの OR',xor:'ビットごとの XOR'};
  if(['shl','shr','ushr'].includes(operation)){summary=`${type} の値を${operation==='shl'?'左':'右'}へずらします。TOP の int 値がずらすビット数，その下の値が対象です。`;add([`ずらす値 : ${type}`,'ビット数 : int'],[`ずらした値 : ${type}`]);}
  else{const ordered=['sub','div','rem'].includes(operation);summary=`スタックから2つの ${type} 値を取り出して${descriptions[operation]}を行い，結果を1つ積みます。`;
   if(ordered)summary+=operation==='sub'?'TOP の値を，その下の値から引きます。':'TOP の値で，その下の値を割ります。';
   const labels=operation==='sub'?['引かれる値','引く値']:ordered?['割られる値','割る値']:['値1','値2'];
   const bitNote:Record<string,string>={and:'両方のビットが 1 の位置だけ，結果を 1 にします。',or:'少なくとも片方のビットが 1 なら，結果を 1 にします。',xor:'2つのビットが異なる位置だけ，結果を 1 にします。'};
   add(labels.map(label=>`${label} : ${type}`),[`${labels[0]} ${symbols[operation]} ${labels[1]} : ${type}`],bitNote[operation]);
  }
 }

 else if(/^[ilfd]neg$/.test(op))add([`値 : ${type}`],[`−値 : ${type}`]);
 else if(/^[ilfd]2/.test(op)){summary=`スタックの値を ${type} から ${types[op[2]]} に変換します。`;add([`値 : ${type}`],[`変換した値 : ${'bcs'.includes(op[2])?'int':types[op[2]]}`],'bcs'.includes(op[2])?'指定した型の幅に狭めたあと，スタック上では int として扱います。byte / short は符号拡張，char はゼロ拡張されます。':undefined);}
 else if(/^[ilfdabcs]a(load|store)$/.test(op)){const store=op.endsWith('store'),valueType='bcs'.includes(op[0])?'int':type;summary=store?'配列・添字・値をスタックから取り出し，配列の指定要素へ保存します。':'配列と添字をスタックから取り出し，配列の指定要素を読み出します。';add(['配列への参照','添字 : int',...(store?[`値 : ${valueType}`]:[])],store?[]:[`要素 : ${valueType}`],'bcs'.includes(op[0])?'byte・boolean・char・short の配列要素も，スタック上では int です。':undefined);}
 else if(/^(get|put)(field|static)$/.test(op)){const put=op.startsWith('put'),instance=op.endsWith('field');summary=`${instance?'オブジェクトの':'クラスに属する static な'}フィールドを${put?'書き換えます':'読み出します'}。${instance?'対象オブジェクトの参照もスタックに必要です。':'対象オブジェクトの参照は不要です。'}`;example=op+' '+(instance?'Example->value:I':put?'Counter->count:I':'java/lang/System->out:Ljava/io/PrintStream;');add([...(instance?['対象オブジェクト']:[]),...(put?['フィールドの型に合う値']:[])],put?[]:['フィールドの値'],'型は : の後ろの descriptor で決まります。');}
 else if(op.startsWith('invoke')){const instance=!['invokestatic','invokedynamic'].includes(op);summary=`${instance?'対象オブジェクトと引数':'引数'}をスタックから取り出し，メソッドを呼び出します。戻り値があれば，戻ってきたときにスタックへ積まれます。`;example=op==='invokevirtual'?'invokevirtual java/io/PrintStream->println(Ljava/lang/String;)V':op==='invokestatic'?'invokestatic java/lang/Math->abs(I)I':op;add([...(instance?['対象オブジェクト']:[]),'引数1','… 引数N'],['戻り値'],'戻り型が V (void) なら戻り値は積まれません。',undefined,'値を返すメソッド');add([...(instance?['対象オブジェクト']:[]),'引数1','… 引数N'],[],'descriptor の括弧内が引数，括弧の後ろが戻り型です。',undefined,'void を返すメソッド');}
 else if(/^[ilfda]?return$/.test(op)){summary=op==='return'?'現在のメソッドを終了し，値を返さず呼び出し元へ戻ります。':`${type} の値を取り出して呼び出し元へ返し，現在のメソッドを終了します。`;add(op==='return'?[]:[`戻り値 : ${type}`],['メソッド終了'],'現在のスタックとローカル変数配列は破棄されます。図の右側は同じフレームの続きではありません。');}
 else if(op==='athrow')add(['例外オブジェクト'],['ハンドラー: 例外オブジェクト'],'通常の次の命令には進みません。対応するハンドラーのスタックは例外参照1つで開始します。見つからなければ呼び出し元へ伝播します。');
 else if(/^if/.test(op)){summary='条件を調べ，成立すれば指定したラベルへ進みます。不成立なら次の命令へ進みます。比較に使った値はどちらの場合も取り出されます。';example=op+' Label';add(/cmp/.test(op)?['比較する値1','比較する値2']:['比較する値'],[]);}
 else if(/^[lfd]cmp/.test(op))add([`値1 : ${type}`,`値2 : ${type}`],['−1 / 0 / 1 : int'],op==='lcmp'?'比較結果を積みます。分岐は行いません。':`どちらかが NaN なら ${op.endsWith('l')?'−1':'1'} を積みます。`);
 else if(/switch$/.test(op))add(['分岐キー : int'],[],'一致する分岐先，なければ default へ進みます。');
 else if(/^goto/.test(op)){example=op+' Label';add([],[],'値を動かさず，指定したラベルへ進みます。');}
 else if(/^jsr/.test(op))add([],['戻り先アドレス'],'古い finally 実装用です。現代の class ファイルでは使用制約があります。');
 else if(op==='ret')add([],[],'ローカル変数 N にある戻り先アドレスへ進みます。通常のメソッド復帰には return 系を使います。');
 else if(op==='new'){example='new java/lang/StringBuilder';add([],['未初期化のオブジェクト参照'],'生成後は invokespecial で <init> を呼び出して初期化します。');}
 else if(/^(a?newarray|multianewarray)$/.test(op))add(op==='multianewarray'?['各次元の長さ : int']:['長さ : int'],['配列への参照']);
 else if(op==='arraylength')add(['配列への参照'],['長さ : int']);
 else if(op==='checkcast')add(['参照'],['同じ参照'],'対象の型として扱えるかを検査します。新しいオブジェクトを作る命令ではありません。');
 else if(op==='instanceof')add(['参照'],['適合する: 1 / しない: 0'],'結果の型は int です。null の結果は 0 です。');
 else if(op.startsWith('monitor'))add(['対象オブジェクト'],[],op==='monitorenter'?'対象のモニターを取得します。':'対象のモニターを解放します。');
 else if(op==='nop')add([],[],'何も変更せず，次の命令へ進みます。');
 else if(op==='wide'){example='wide iload 256';add([],['値 : int'],'wide iload の例です。wide は後続命令のインデックス等を広く符号化します。前後の変化は対象命令と同じです。');}
 else {
  // The source documentation groups stack-manipulation variants; isolate the selected mnemonic.
  let section=markdown.split('スタック効果:**')[1]?.split(/\n##### /)[0]??'';
  const groups=section.split(/\n\*\s+\*\*/);const selected=groups.find(g=>g.replace(/\\_/g,'_').startsWith(op+'**'));
  if(selected)section=selected;
  const pairs=[...section.matchAll(/Before:\s*`([^`]+)`([^\n]*)[\s\S]*?After:\s*`([^`]+)`/g)];
  pairs.forEach((m,i)=>add(m[1].split(',').map(s=>s.trim()).filter(s=>s!=='...'),m[3].split(',').map(s=>s.trim()).filter(s=>s!=='...'),m[2].trim()||'値のカテゴリ制約は詳細解説を確認してください。',undefined,pairs.length>1?'形式 '+(i+1):'基本の形'));
 }
 const constraints:Record<string,string[]>={
  pop:['value はカテゴリ1です。'],pop2:['value1・value2 はカテゴリ1です。','value はカテゴリ2です。'],
  dup:['value はカテゴリ1です。'],swap:['value1・value2 はカテゴリ1です。'],
  dup_x1:['すべての値はカテゴリ1です。'],dup_x2:['すべての値はカテゴリ1です。','TOP の value1 はカテゴリ1，その下の value2 はカテゴリ2です。'],
  dup2:['value1・value2 はカテゴリ1です。','value はカテゴリ2です。'],
  dup2_x1:['すべての値はカテゴリ1です。','TOP の value1 はカテゴリ2，その下の value2 はカテゴリ1です。'],
  dup2_x2:['すべての値はカテゴリ1です。','TOP の value1 はカテゴリ2，その下の value2・value3 はカテゴリ1です。','TOP の value1・value2 はカテゴリ1，その下の value3 はカテゴリ2です。','value1・value2 はカテゴリ2です。']
 };

 if(/^if/.test(op)){
  const relation:Record<string,string>={eq:'等しい',ne:'異なる',lt:'小さい',ge:'以上',gt:'大きい',le:'以下'};
  const condition=op==='ifnull'?'参照が null':op==='ifnonnull'?'参照が null 以外':/cmp/.test(op)?(['eq','ne'].includes(op.slice(-2))?`2つの値が${relation[op.slice(-2)]}`:`TOP の下の値が TOP の値と比較して「${relation[op.slice(-2)]}」`):`TOP の int 値が 0 と比較して「${relation[op.slice(-2)]}」`;
  summary=`${condition}なら，指定したラベルへ進みます。成立しなければ次の命令へ進みます。比較に使った値は，どちらの場合もスタックから取り出されます。`;
 }
 const summaries:Record<string,string>={
  invokevirtual:'対象オブジェクトの実際のクラスに従ってインスタンスメソッドを呼びます。オーバーライドが反映されます。',
  invokeinterface:'インターフェースのメソッドを，そのオブジェクトが実装する処理で呼び出します。',
  invokespecial:'コンストラクターや親クラスのメソッドを，通常の仮想呼び出しと異なる規則で呼びます。',
  invokestatic:'指定した static メソッドを呼びます。スタックに積むのは引数だけで，対象オブジェクトは不要です。',
  invokedynamic:'bootstrap メソッドで結び付けた呼び出し先を実行します。引数と戻り値の型は descriptor で決まります。',
  new:'クラスの新しいインスタンスを確保し，未初期化の参照を積みます。コンストラクターの呼び出しは別に必要です。',
  newarray:'指定した長さのプリミティブ型配列を作り，その参照を積みます。',
  anewarray:'指定した長さの参照型配列を作り，その参照を積みます。各要素の初期値は null です。',
  multianewarray:'各次元の長さを取り出し，多次元配列をまとめて作ります。',
  arraylength:'配列の参照を取り出し，要素数を int として積みます。',
  checkcast:'参照を指定した型として扱えるか検査します。成功すれば同じ参照を残し，失敗すれば例外を投げます。',
  instanceof:'参照先が指定した型に適合するかを調べ，結果を int の 1 または 0 として積みます。',
  athrow:'例外オブジェクトを投げ，通常の実行を中断して例外ハンドラーへ処理を移します。',
  monitorenter:'対象オブジェクトのモニターを取得し，ほかのスレッドとの排他制御を始めます。',
  monitorexit:'対象オブジェクトのモニターを1回分解放します。',
  tableswitch:'int のキーを連続した範囲の表で調べ，対応するラベルへ分岐します。',
  lookupswitch:'int のキーに一致する項目を探し，対応するラベルへ分岐します。',
  nop:'スタックもローカル変数も変更せず，次の命令へ進みます。',
  wide:'後続命令で指定できるローカル変数番号や iinc の増減量を広げます。',
  ret:'ローカル変数に保存した returnAddress へ戻ります。メソッドからの復帰ではありません。',
  pop:'スタックの一番上からカテゴリ1の値を1つ取り除きます。',
  pop2:'スタックの一番上から，カテゴリ1の値2つ，またはカテゴリ2の値1つを取り除きます。',
  dup:'スタックの一番上のカテゴリ1の値を複製し，その上へ積みます。',
  dup_x1:'TOP のカテゴリ1の値を複製し，その下のカテゴリ1の値を越えた位置へ差し込みます。',
  dup_x2:'TOP のカテゴリ1の値を複製し，その下の2スロット分の値を越えた位置へ差し込みます。',
  dup2:'TOP から2スロット分の値を複製し，そのままの順で一番上へ積みます。',
  dup2_x1:'TOP から2スロット分の値を複製し，その下のカテゴリ1の値を越えた位置へ差し込みます。',
  dup2_x2:'TOP から2スロット分の値を複製し，その下の2スロット分の値を越えた位置へ差し込みます。',
  swap:'スタックの一番上の2つの値を交換します。両方ともカテゴリ1である必要があります。'
 };
 if(summaries[op])summary=summaries[op];
 if(op==='aconst_null')summary='どのオブジェクトも指していない参照 null をスタックへ積みます。';
 if(m=op.match(/^([ilfd])const_(m1|[0-5])$/))summary=`${type} の定数 ${m[2]==='m1'?'-1':m[2]} をスタックへ積みます。`;
 if(/^[bs]ipush$/.test(op))summary=`命令に書いた ${op==='bipush'?'8':'16'} ビットの符号付き整数を，int としてスタックへ積みます。`;
 if(/^ldc/.test(op))summary=op==='ldc2_w'?'定数プールから long / double の定数を読み出して積みます。':'定数プールから文字列や int / float などの定数を読み出して積みます。'+(op==='ldc_w'?'定数プールの番号を広く指定できる形式です。':'');
 if(/^[ilfd]neg$/.test(op))summary=`スタックの ${type} 値を取り出し，符号を反転して積み直します。`;
 if(/^[lfd]cmp/.test(op))summary=`2つの ${type} 値を比較し，大小関係を int の −1 / 0 / 1 として積みます。分岐そのものは行いません。`;
 if(/^goto/.test(op))summary='スタックの値を変更せず，指定したラベルへ無条件に分岐します。';
 if(/^jsr/.test(op))summary='次の命令の戻り先アドレスを積み，同じメソッド内のサブルーチンへ分岐します。';
 if(/^if_acmp/.test(op))summary=`2つの参照が${op.endsWith('eq')?'同じオブジェクトを指す（または両方 null）':'異なる'}なら指定したラベルへ分岐します。比較した参照は両方とも取り除きます。`;
 if(/^[ilfdabcs]a(load|store)$/.test(op))summary=`${type} 配列の指定した添字の要素を${op.endsWith('store')?'書き換えます。スタックから配列・添字・値を取り出します。':'読み出します。配列と添字を取り出し，要素の値を積みます。'}`;
 const examples:Record<string,string>={
  newarray:'newarray I',anewarray:'anewarray Ljava/lang/String;',multianewarray:'multianewarray [[I 2',
  checkcast:'checkcast Ljava/lang/String;',instanceof:'instanceof Ljava/lang/String;',
  invokeinterface:'invokeinterface java/util/List->size()I',invokespecial:'invokespecial java/lang/StringBuilder-><init>()V',
  tableswitch:'tableswitch 0 { Zero, One, Two } default Other',lookupswitch:'lookupswitch { 1: One, 100: Hundred, default: Other }',
  jsr:'jsr Finally',jsr_w:'jsr_w Finally',ret:'ret 1'
 };
 if(examples[op])example=examples[op];
 if(constraints[op])forms.forEach((form,i)=>form.note=constraints[op][i]);
 const names=(text:string)=>text.replace(/value([1-4])|値([1-4])/g,(_,a,b)=>'abcd'[Number(a??b)-1]).replace(/\bvalue\b/g,'a');
 for(const form of forms){form.before=form.before.map(names);form.after=form.after.map(names);if(form.note)form.note=names(form.note);}
 return {op,related:relatedInstructions(op),category:category(op),title:doc.title,summary,example,forms,markdown:instructionDetails(op)};
}
