import {generateSW} from 'workbox-build';
import {readdir,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
async function inventory(directory,prefix=''){
 const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){
  const relative=prefix+entry.name;if(entry.isDirectory())files.push(...await inventory(join(directory,entry.name),relative+'/'));
  else if(!entry.name.startsWith('.')&&!['sw.js','offline-manifest.json'].includes(entry.name)&&!entry.name.endsWith('.map'))files.push({url:relative,bytes:(await stat(join(directory,entry.name))).size});
 }return files;
}
const files=await inventory('dist');await writeFile('dist/offline-manifest.json',JSON.stringify({bytes:files.reduce((n,f)=>n+f.bytes,0),files:files.length,urls:files.map(f=>f.url)}));
const result=await generateSW({globDirectory:'dist',globPatterns:['**/*'],globIgnores:['**/*.map','**/.*','sw.js'],swDest:'dist/sw.js',maximumFileSizeToCacheInBytes:64*1024*1024,inlineWorkboxRuntime:true,clientsClaim:true,skipWaiting:false,ignoreURLParametersMatching:[/.*/],cleanupOutdatedCaches:true});
if(result.warnings.length)throw new Error(result.warnings.join('\n'));
console.log(`Offline: ${result.count} files, ${(result.size/1024/1024).toFixed(1)} MiB`);
