const typeName=/^(?:[A-Za-z_$][\w$]*[./])*([A-Za-z_$][\w$]*(?:\[\])*)$/;
const integer=/^[+-]?(?:\d+|0x[\da-f]+|0b[01]+)$/i;
const decimal=/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|Infinity|NaN)$/i;
const shortenType=(type:string)=>type.match(typeName)?.[1]??type;

/** Keep analysis types intact; only compact their presentation in frame diagrams. */
export function formatFrameValue(value:string):string{
 const typed=value.match(/^(.*)\s*:\s*((?:[A-Za-z_$][\w$]*[./])*[A-Za-z_$][\w$]*(?:\[\])*)$/s);
 if(!typed)return shortenType(value);
 const literal=typed[1].trimEnd(),type=shortenType(typed[2]);
 if(type==='String'&&literal.startsWith('"'))return literal;
 if(type==='char'&&/^'(?:[^'\\]|\\(?:u[\da-fA-F]{4}|.))'$/.test(literal))return literal;
 if(type==='boolean'&&/^(true|false)$/.test(literal))return literal;
 if(type==='int'&&integer.test(literal))return literal;
 if(type==='byte'&&/^[+-]?0x[\da-f]+$/i.test(literal))return literal;
 if(type==='short'&&/^[+-]?\d+s$/i.test(literal))return literal;
 if(type==='short'&&integer.test(literal))return literal+'s';
 if(type==='long'&&/^[+-]?(?:\d+|0x[\da-f]+|0b[01]+)L$/i.test(literal))return literal;
 if(type==='long'&&integer.test(literal))return literal+'L';
 for(const [name,suffix] of [['float','f'],['double','d']]){
  if(type!==name)continue;
  if(literal.toLowerCase().endsWith(suffix)&&decimal.test(literal.slice(0,-1)))return literal;
  if(decimal.test(literal))return literal+suffix;
 }
 return literal+' : '+type;
}
