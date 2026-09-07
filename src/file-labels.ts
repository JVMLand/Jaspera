export function fileLabel(path:string){return path.replaceAll('\\','/').split('/').pop()!.replace(/\.jal$/i,'');}
/** The shortest distinguishing suffix among the open documents in a window. */
export function tabLabels(files:readonly {key:string;path:string}[]):Map<string,string>{
 const entries=files.map(file=>{const parts=file.path.replaceAll('\\','/').split('/');parts[parts.length-1]=fileLabel(file.path);return {...file,parts,depth:1};});
 const label=(entry:typeof entries[number])=>entry.parts.slice(-entry.depth).join('/');
 for(;;){
  const counts=new Map<string,number>();for(const entry of entries){const text=label(entry);counts.set(text,(counts.get(text)??0)+1);}
  const collisions=entries.filter(entry=>counts.get(label(entry))!>1&&entry.depth<entry.parts.length);
  if(!collisions.length)break;for(const entry of collisions)entry.depth++;
 }
 return new Map(entries.map(entry=>[entry.key,label(entry)]));
}
