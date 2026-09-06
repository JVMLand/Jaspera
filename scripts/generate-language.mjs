import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import TurndownService from 'turndown';
const grammar=await readFile('vendor/langjal/antlr/tokyo/peya/langjal/compiler/JAL.g4','utf8');
const instructions=[...grammar.matchAll(/^INSN_\w+:\s*'([^']+)'/gm)].map(m=>m[1]);
const keywords=[...grammar.matchAll(/^KWD_\w+:\s*'([^']+)'/gm)].map(m=>m[1]);
const converter=new TurndownService({codeBlockStyle:'fenced',headingStyle:'atx'});
const documents={};
for (const dir of ['vendor/javasm/instructions','vendor/javasm/localization/ja/instructions']) {
 for(const file of await readdir(dir)) {
  if(!file.endsWith('.html')) continue;
  const html=await readFile(`${dir}/${file}`,'utf8');
  const names=html.match(/<!--\s*Instructions:\s*([\w,\s]+)-->/)?.[1].split(',').map(s=>s.trim())??[];
  for(const name of names) {
   const markdown=converter.turndown(html.replaceAll('{instruction}',name).replace(/\{link:([\w]+)\}/g,(_,word)=>word));
   documents[name]={title:markdown.split('\n').find(s=>s.trim())?.replace(/^#+\s*/, '')??name,markdown};
  }
 }
}
const supplemental = {
  arraylength: ['配列の長さ', '配列参照を取り出し、その要素数を int としてスタックに積みます。\n\n`..., arrayref → ..., length`\n\n配列参照が null の場合は NullPointerException。'],
  iushr: ['int の論理右シフト', 'int 値を指定ビット数だけ右にシフトし、上位ビットを 0 で埋めます。シフト量は下位 5 ビットです。\n\n`..., value, shift → ..., result`'],
  lushr: ['long の論理右シフト', 'long 値を指定ビット数だけ右にシフトし、上位ビットを 0 で埋めます。シフト量は int の下位 6 ビットです。\n\n`..., value, shift → ..., result`'],
  lcmp: ['long の比較', '2 つの long 値を比較し、value1 が value2 より小さい・等しい・大きい場合に int の -1・0・1 を積みます。\n\n`..., value1, value2 → ..., result`'],
  aload_4: ['ローカル参照の読み込み', '上流文法に含まれる非標準の表記です。標準の JVM 命令 `aload 4` を使用してください。']
};
for(const [name,[title,body]] of Object.entries(supplemental)) documents[name] ??= {title,markdown:`## ${title}\n\n${body}`};
await mkdir('src/generated',{recursive:true});
await writeFile('src/generated/language.json',JSON.stringify({instructions,keywords,documents},null,2)+'\n');
console.log(`Generated ${instructions.length} instructions and ${Object.keys(documents).length} documentation entries`);
