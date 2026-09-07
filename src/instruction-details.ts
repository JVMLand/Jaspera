// Behaviour beyond the diagrams. Every supported instruction has an explicit family.
export function instructionDetails(op:string){
 const arithmetic=op.match(/^([ilfd])(add|sub|mul|div|rem|and|or|xor|shl|shr|ushr)$/);
 if(arithmetic){
  const [,kind,operation]=arithmetic,integer=kind==='i'||kind==='l',bits=kind==='l'?64:32;
  if(['and','or','xor'].includes(operation))return '### ビット演算の用途\n\n'+({and:'マスクで指定したビットだけを取り出すときに使います。例えば 13 AND 6 は 4 です。',or:'指定したビットを立てるときに使います。例えば 8 OR 3 は 11 です。',xor:'指定したビットを反転するときに使います。例えば 13 XOR 6 は 11 です。同じ値どうしの XOR は 0 になります。'} as Record<string,string>)[operation];
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
 const section=(heading:string,text:string)=>`### ${heading}\n\n${text}`;
 const type=({i:'int',l:'long',f:'float',d:'double',a:'参照',b:'byte / boolean',c:'char',s:'short'} as Record<string,string>)[op[0]];
 let match:RegExpMatchArray|null;
 if(match=op.match(/^([ilfda])(load|store)(?:_([0-3]))?$/))return section('ローカル変数の指定',
  (match[3]===undefined?'命令の後ろにスロット番号を書きます。番号は 0 から始まります。255 を超える番号には wide を付けます。':`末尾の ${match[3]} がスロット番号です。別の引数は書きません。通常形より短いバイトコードで同じ操作を行います。`)+
  '\n\n'+(match[2]==='load'?'読み出してもローカル変数の値は残ります。読み出すスロットには、この命令の型に合う値があらかじめ保存されている必要があります。':'以前の値を上書きします。')+
  (/[ld]/.test(match[1])?' long / double は指定したスロットとその次のスロットを使います。後半のスロットだけを読み出すことはできません。':'')+
  (match[1]==='a'?'\n\n'+(match[2]==='load'?'null も通常の参照として読み出せます。古い jsr の returnAddress は aload では読み出せません。':'参照を保存してもオブジェクトは複製されません。古い jsr が積む returnAddress も保存できますが、オブジェクト参照とは別の型です。'):'') );
 if(op==='iinc')return section('増減量', 'スロット番号、加算する整数の順に書きます。iinc 1 -1 なら #1 を 1 減らします。対象は初期化済みの int です。\n\n通常形の増減量は −128〜127、wide 付きは −32768〜32767 です。int の範囲を超える計算結果は下位 32 ビットになり、例外は発生しません。');
 if(op==='aconst_null')return section('null の意味','どのオブジェクトも指していない参照です。整数の 0 とは型が異なります。参照型の引数や戻り値として渡せますが、その参照を使ってフィールドや配列要素にアクセスすると NullPointerException が発生します。');
 if(match=op.match(/^([ilfd])const_(m1|[0-5])$/))return section('定数の選び方',`値は命令名に含まれているので、後ろに数値は書きません。${match[1]==='i'?'−1〜5 は iconst 系、−128〜127 は bipush、−32768〜32767 は sipush、それ以外は ldc が使えます。':match[1]==='l'?'0 と 1 以外の long 定数には ldc2_w を使います。':match[1]==='f'?'0、1、2 以外の float 定数には ldc を使います。':'0 と 1 以外の double 定数には ldc2_w を使います。'}${/[fd]/.test(match[1])?' この系列の 0 は正のゼロです。':''}`);
 if(/^[bs]ipush$/.test(op))return section('値の範囲',`${op==='bipush'?'−128〜127 の符号付き 8 ビット整数':'−32768〜32767 の符号付き 16 ビット整数'}を命令に埋め込みます。スタックへ積む際には符号を保って int に拡張します。byte / short 型の値がスタックに積まれるわけではありません。`);
 if(/^ldc/.test(op))return section('読み出せる定数',op==='ldc2_w'?'long / double 定数を定数プールから読み出します。末尾の 2 は値が 2 スロットを使うことを表します。2つの定数を読む命令ではありません。JAL では例えば ldc2_w 10L と書きます。動的定数の場合も型は long または double です。':`int、float、文字列、クラス、メソッド型、メソッドハンドル、カテゴリ1の動的定数を読み出せます。long / double には ldc2_w を使います。\n\n${op==='ldc_w'?'ldc と積まれる値は同じです。違いは定数プールの番号を 16 ビットで指定する点で、大きな定数プールに対応します。':'ldc のバイトコードでは定数プールの番号を 8 ビットで指定します。大きな番号を使う場合は ldc_w が必要です。'} JAL では定数プールの番号を直接書く代わりに、読み出す定数を書きます。`);
 if(/^[ilfd]neg$/.test(op))return section('符号の反転',/[il]/.test(op[0])?'0 は 0 のままです。その型の最小値は正の値として表せないため、反転しても最小値のままになります。例外は発生しません。':'正のゼロは負のゼロに、負のゼロは正のゼロになります。無限大の符号も反転します。NaN は NaN のままです。');
 if(/^[ilfdabcs]a(load|store)$/.test(op)){
  const store=op.endsWith('store');
  const special:Record<string,string>={b:store?'byte 配列では下位 8 ビットを保存します。boolean 配列では下位 1 ビットを保存します。':'byte 配列の要素は符号を保って int に拡張されます。boolean 配列からは 0 または 1 が得られます。',c:store?'下位 16 ビットを char として保存します。':'char の 16 ビットをゼロ拡張し、0〜65535 の int として積みます。',s:store?'下位 16 ビットを short として保存します。':'short の 16 ビットを符号を保って int に拡張します。',a:store?'保存する参照は、実際の配列の要素型に代入できる必要があります。例えば String[] に Integer を保存すると ArrayStoreException が発生します。null は保存できます。':'オブジェクトを複製せず、要素に保存された参照を積みます。null の要素も読み出せます。'};
  return section('配列の要素',`添字は 0 から始まります。対象は ${type} の配列です。${special[op[0]]??''}\n\n配列の参照が null なら NullPointerException、添字が負または配列の長さ以上なら ArrayIndexOutOfBoundsException が発生します。`);
 }
 if(/^(get|put)(field|static)$/.test(op)){
  const put=op.startsWith('put'),instance=op.endsWith('field');
  return section('フィールドの指定','クラス名、->、フィールド名、:、型の descriptor を書きます。例えば Counter->value:I は Counter の int フィールド value です。'+
   (instance?'\n\n対象オブジェクトが null なら NullPointerException が発生します。': '\n\nフィールドを宣言しているクラスが未初期化なら、アクセス前にクラスの初期化が行われます。')+
   (put?'\n\n保存する値はフィールドの型に合っている必要があります。final フィールドへの書き込みは、宣言クラスの'+(instance?'コンストラクター <init>':'クラス初期化メソッド <clinit>')+'内に制限されます。':''));
 }
 const calls:Record<string,string>={
  invokevirtual:'インスタンスの実際のクラスに従って、オーバーライドされたメソッドを選びます。例えば変数の宣言型が親クラスでも、参照先が子クラスなら子クラスの実装が呼ばれます。',
  invokeinterface:'インターフェースで宣言されたインスタンスメソッドを呼びます。参照先のクラスが実装するメソッドが選ばれます。static なインターフェースメソッドには invokestatic を使います。',
  invokespecial:'コンストラクター <init>、親クラスのメソッドなど、通常の仮想呼び出しと異なる規則で呼び出すときに使います。new の直後の参照は未初期化なので、利用する前に <init> を呼ぶ必要があります。',
  invokestatic:'static メソッドを呼びます。this に相当する参照は積みません。呼び出し先を宣言しているクラスが未初期化なら、メソッドの実行前にクラスの初期化が行われます。',
  invokedynamic:'呼び出し先は、bootstrap メソッドで解決した CallSite によって決まります。Java のラムダや文字列連結などで使われます。クラス名から通常のメソッドを探す命令ではなく、bootstrap とその引数の設定が必要です。'
 };
 if(calls[op])return section('呼び出し先の決まり方',calls[op])+sectionBreak('引数と戻り値','descriptor の括弧内が引数、括弧の後ろが戻り型です。(II)I なら int を2つ受け取り、int を1つ返します。引数は宣言順に積み、最後の引数が TOP になります。'+(!['invokestatic','invokedynamic'].includes(op)?' 対象オブジェクトの参照は引数より先に積みます。参照が null なら NullPointerException が発生します。':'')+' 戻り型が V なら、呼び出し後に戻り値は積まれません。');
 if(/^[ilfda]?return$/.test(op))return section('復帰と戻り型',op==='return'?'戻り型が V（void）のメソッドで使います。呼び出し元では、呼び出し命令の次から実行を再開します。':'呼び出し元のスタックへ値を1つ渡し、呼び出し命令の次から実行を再開します。'+(op==='ireturn'?'boolean / byte / char / short を返すメソッドも ireturn を使います。これらの値はメソッド内のスタックでは int として扱われます。':op==='areturn'?'返す参照は宣言された戻り型に代入できる必要があります。null も返せます。':`メソッドの戻り型は ${type} である必要があります。`));
 if(op==='athrow')return section('例外の伝わり方','Throwable またはそのサブクラスの参照を積んで使います。null を投げると NullPointerException になります。\n\n現在の位置を保護する例外ハンドラーから、例外の型に合うものを探します。見つかればスタックを空にして例外参照だけを積み、ハンドラーへ進みます。なければこのメソッドを抜け、呼び出し元でも同じように探します。');
 if(/^if/.test(op))return section('比較する値',/^if_acmp/.test(op)?'オブジェクトの内容ではなく、同じオブジェクトを指しているかを比較します。両方が null なら等しいと判定します。文字列の内容を比較したい場合は equals メソッドを呼びます。':/^ifnonnull$|^ifnull$/.test(op)?'参照1つを null と比較します。null でないことを確認してからメソッドを呼ぶ、といった分岐に使えます。':/^if_icmp/.test(op)?'int 値を2つ比較します。long / float / double は直接比較できないので、lcmp / fcmp 系 / dcmp 系で int の比較結果を作ってから if 系で分岐します。':'int 値を1つ取り出し、0 と比較します。boolean の判定では 0 が false、0 以外が true です。ifeq は false の分岐、ifne は true の分岐に使えます。');
 if(/^[lfd]cmp/.test(op))return section('比較結果','先に積んだ値が TOP の値より小さければ −1、等しければ 0、大きければ 1 を積みます。次に iflt / ifeq / ifgt などを置くことで分岐できます。'+(op==='lcmp'?' 減算と違い、オーバーフローを起こさず大小を比較できます。':`\n\nどちらかが NaN のときは ${op.endsWith('l')?'−1':'1'} を積みます。${op.endsWith('l')?'「より大きい」を ifgt で判定する場合':'「より小さい」を iflt で判定する場合'}、NaN では分岐しなくなります。正のゼロと負のゼロは等しいと判定します。`));
 if(/switch$/.test(op))return section('分岐先の選び方',op==='tableswitch'?'連続する整数の範囲に対して、値ごとの分岐先を表で指定します。範囲外は default へ進みます。例えば 0、1、2 のような密な選択肢に向きます。範囲内で特別な処理が不要な値には default と同じ行き先を指定できます。':'整数のキーと分岐先の組を列挙します。一致するキーがなければ default へ進みます。例えば 1、100、10000 のような離れた選択肢に向きます。class ファイルではキーは昇順で、重複しない必要があります。');
 if(/^goto/.test(op))return section('無条件の分岐','同じメソッド内のラベルへ進みます。ループの先頭に戻る場合や、if の片側の処理後にもう片側を飛ばす場合に使います。'+(op==='goto_w'?' 分岐先までの相対オフセットを符号付き 32 ビットで持ち、goto より遠くへ分岐できます。':' バイトコードの相対オフセットは符号付き 16 ビットです。範囲外への分岐には goto_w を使います。'));
 if(/^jsr/.test(op)||op==='ret')return section('古いサブルーチン命令','jsr は次の命令のアドレスを returnAddress として積み、同じメソッド内のサブルーチンへ分岐します。サブルーチンでは astore でそのアドレスを保存し、ret に保存先のスロット番号を指定して戻ります。jsr_w は分岐オフセットが 32 ビットの形式です。\n\n古い finally の実装に使われました。class ファイルのバージョン 51.0（Java 7）以降では使用できません。通常のメソッド呼び出しと復帰には invoke 系と return 系を使います。');
 const objectDetails:Record<string,string>={
  new:'クラス名を指定してメモリーを確保します。各フィールドには 0 / false / null などの初期値が入りますが、コンストラクターはまだ実行されていません。通常は dup で参照を残してから invokespecial で <init> を呼びます。抽象クラスやインターフェースの実体は作れません。',
  newarray:'I（int）や Z（boolean）などのプリミティブ型の descriptor を命令の引数に指定し、要素数をスタックへ積みます。要素はその型の 0 / false で初期化されます。長さ 0 は有効ですが、負の長さなら NegativeArraySizeException が発生します。',
  anewarray:'要素となる参照型の descriptor を命令の引数に指定し、要素数をスタックへ積みます。全要素は null で、要素のオブジェクトまでは作られません。要素型に配列型を指定することもできます。負の長さなら NegativeArraySizeException が発生します。',
  multianewarray:'配列の descriptor と、確保する次元数を指定します。長さは外側の次元から順に積みます。指定した次元数が配列型の次元数より少ない場合、その先の配列は作られず null のままです。次元数は 1 以上で配列型の次元数以下、各長さは 0 以上が必要です。負の長さなら NegativeArraySizeException が発生します。',
  arraylength:'要素の個数を返します。最後の添字は長さ − 1 です。多次元配列では、指定した参照が指す1つの配列の長さだけを返します。null なら NullPointerException が発生します。',
  checkcast:'参照先が指定したクラスやインターフェースの型として扱えるかを調べます。成功時は同じ参照が残り、失敗すると ClassCastException が発生します。null は検査に成功します。数値型の変換には使えません。',
  instanceof:'参照先を指定した型に代入できるなら 1、できないなら 0 を積みます。null は 0 です。checkcast と違い、型が合わなくても ClassCastException は発生しません。結果を ifeq / ifne で調べて処理を分けられます。',
  monitorenter:'オブジェクトのモニターを取得します。他のスレッドが所有している間は待ちます。自分のスレッドがすでに所有している場合は取得回数を増やします。参照が null なら NullPointerException が発生します。',
  monitorexit:'自分のスレッドが持つモニターの取得回数を1つ減らし、0 になったら他のスレッドが取得できるようにします。所有していなければ IllegalMonitorStateException、null なら NullPointerException が発生します。正常終了と例外終了の両方で、取得に対応する解放が行われるようにします。',
  nop:'何もせず次の命令へ進みます。バイトコード上は 1 バイトを使います。パッチ用の場所を確保する用途などがあります。',
  wide:'後続の load / store / ret のローカル変数番号を符号なし 16 ビットに拡張します。iinc では、さらに増減量を符号付き 16 ビットへ拡張します。値の型や計算の精度は変わりません。後続命令と合わせて1つの命令なので、途中へ分岐することはできません。'
 };
 if(objectDetails[op])return section(op.startsWith('monitor')?'モニターの所有':op==='wide'?'拡張するオペランド':'動作と注意点',objectDetails[op]);
 if(/^(pop|dup|swap)/.test(op))return section('値の並べ替え',op.startsWith('pop')?'戻り値など、使わない値を捨てるときに使います。long / double は途中で分割できないので pop2 で1つの値として取り除きます。pop2 はカテゴリ1の値を2つ取り除くこともできます。':op==='swap'?'TOP とその下の値を交換します。どちらもカテゴリ1である必要があり、long / double を直接 swap することはできません。':'計算や保存で消費する前に、同じ値をもう一度使えるようコピーを残します。参照を複製してもオブジェクトは複製されません。同じオブジェクトを指す参照が増えます。\n\nlong / double を途中で分割する並べ替えはできません。上の図の各形式で、値のカテゴリと積む順序を確認してください。');
 throw new Error(`Missing instruction explanation: ${op}`);
}
function sectionBreak(heading:string,text:string){return `\n\n### ${heading}\n\n${text}`;}
