// Keep behavioural constraints; syntax, examples and stack effects are already shown above.
export function instructionDetails(op:string,markdown:string){
 const arithmetic=op.match(/^([ilfd])(add|sub|mul|div|rem|and|or|xor|shl|shr|ushr)$/);
 if(arithmetic){
  const [,kind,operation]=arithmetic,integer=kind==='i'||kind==='l',bits=kind==='l'?64:32;
  if(['and','or','xor'].includes(operation))return '';
  if(['shl','shr','ushr'].includes(operation))return `### ビットの扱い

#### シフト量

TOP の int 値の下位 ${kind==='l'?6:5} ビットだけを使います。例えば ${bits} ビットずらす指定は、0 ビットとして扱われます。

#### 空いた位置

${operation==='shl'?'右側を 0 で埋め、左にはみ出したビットは捨てます。':operation==='shr'?'左側を元の符号ビットで埋めます。負の値は負のままです。':'左側を 0 で埋めます。符号ビットも通常のビットとして移動します。'}`;
  if(integer){
   if(operation==='div')return `### 整数除算の規則

#### 丸め

小数部分を 0 の方向に切り捨てます。例えば −7 ÷ 2 の結果は −3 です。

#### ゼロ除算

割る値が 0 なら ArithmeticException が発生します。

#### 最小値 ÷ −1

結果はその型の最小値になります。このオーバーフローでは例外は発生しません。`;
   if(operation==='rem')return `### 整数の余りの規則

#### 符号

結果が 0 でない場合、割られる値と同じ符号になります。例えば −7 を 2 で割った余りは −1 です。

#### ゼロ除算

割る値が 0 なら ArithmeticException が発生します。`;
   return `### 整数演算の規則

#### オーバーフロー

${bits} ビットに収まらない部分は捨てられます。範囲を超えても例外は発生しません。${kind==='i'&&operation==='add'?'例えば 2147483647 + 1 は −2147483648 になります。':''}`;
  }
  return `### 浮動小数点演算の規則

#### 精度と特殊な値

${operation==='rem'?'余りは、商を 0 の方向に切り捨てる考え方で求めます。割られる値が無限大、または割る値が 0 の場合は NaN になります。':'結果はその型の精度に丸められます。NaN を含む演算の結果は NaN です。無限大と符号付きゼロも扱います。'}${operation==='div'?'ゼロで割っても ArithmeticException は発生せず、値に応じて Infinity または NaN になります。':''}`;
 }
 const conversions:Record<string,string>={"i2l": "符号を保って 64 ビットへ拡張します。元の整数値は変わりません。", "i2d": "int のすべての値を double で正確に表せるため、値は変わりません。", "f2d": "float の値を double へ拡張します。有限の値は正確に表現できます。", "l2i": "下位 32 ビットだけを残します。値が int の範囲外なら、大きさや符号が変わることがあります。", "i2f": "float で正確に表せない整数は丸められます。", "l2f": "float で正確に表せない整数は丸められます。", "l2d": "double で正確に表せない大きな整数は丸められます。", "d2f": "float の精度に丸めます。大きすぎる値は無限大、小さすぎる値は符号付きの 0 になる場合があります。", "i2b": "下位 8 ビットを残し、符号を保って int へ拡張します。例えば 255 は −1 になります。", "i2s": "下位 16 ビットを残し、符号を保って int へ拡張します。", "i2c": "下位 16 ビットを残し、上位を 0 で埋めます。結果は 0〜65535 の int です。", "f2i": "小数部分を 0 の方向に切り捨てます。NaN は 0 に、範囲外の値は変換先の最小値または最大値になります。", "f2l": "小数部分を 0 の方向に切り捨てます。NaN は 0 に、範囲外の値は変換先の最小値または最大値になります。", "d2i": "小数部分を 0 の方向に切り捨てます。NaN は 0 に、範囲外の値は変換先の最小値または最大値になります。", "d2l": "小数部分を 0 の方向に切り捨てます。NaN は 0 に、範囲外の値は変換先の最小値または最大値になります。"};
 if(conversions[op])return "### 変換の規則\n\n"+conversions[op];
 const blocks=markdown.split(/(?=^#{2,5} )/m).filter(Boolean),kept:string[]=[];
 for(const block of blocks){const heading=block.split('\n')[0];
  if(/^## /.test(heading)||/形式|スタック効果|Tutorial Pattern|^##### \*\*例:/.test(heading))continue;
  if(/オペランド/.test(heading)&&/なし/.test(block)&&block.length<100)continue;
  if(/実行時例外/.test(heading)&&/命令固有の実行時例外は発生しません/.test(block)&&!/(?:Exception|Error)\b/.test(block))continue;
  let body=block.replace(/^.*定数プール解決を行いません.*\n?/gm,'');
  if(/検証/.test(heading)&&!/(未初期化|一致|アクセス|型互換|初期化|範囲|ラベル|境界|合流)/.test(body))continue;
  body=body.replace(/^#### 目的/m,'### 詳しい動作').replace(/^##### /gm,'#### ');
  kept.push(body.trim());
 }
 return kept.join('\n\n');
}
