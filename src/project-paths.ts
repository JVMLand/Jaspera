import {validatePath} from './project';
export function planPathChange(paths:readonly string[],old:string,destination:string,folder:boolean){
 if(folder&&(destination===old||destination.startsWith(old+'/')))throw new Error('移動元と同じ場所や、その内側には移動できません。');
 const affected=paths.filter(path=>folder?path.startsWith(old+'/'):path===old);
 if(!affected.length)throw new Error('対象のファイルが見つかりません。');
 const changes=new Map(affected.map(path=>[path,folder?destination+path.slice(old.length):destination]));
 const occupied=paths.map(path=>changes.get(path)??path);
 for(const path of changes.values())validatePath(path);
 const lower=occupied.map(path=>path.toLowerCase());
 if(new Set(lower).size!==lower.length||lower.some(path=>lower.some(other=>other!==path&&other.startsWith(path+'/'))))throw new Error('移動先に同じ名前のファイルまたはフォルダーが存在します。');
 if(folder&&paths.some(path=>!changes.has(path)&&path.toLowerCase().startsWith(destination.toLowerCase()+'/')))throw new Error('同じ名前のフォルダーが存在します。');
 return changes;
}
