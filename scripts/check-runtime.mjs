import {access,cp,mkdir} from 'node:fs/promises';
for(const file of ['bovine.js','bjvm_main.wasm','jdk23.jar','jdk23/lib/modules','jdk23/lib/tzdb.dat','jalweb-compiler.jar']) {
 try {await access(`public/runtime/${file}`);} catch {throw new Error(`Missing runtime/${file}. Run pnpm run setup first.`);}
}

await mkdir("public/licenses",{recursive:true});
await cp("licenses","public/licenses",{recursive:true});
await cp("THIRD_PARTY_NOTICES.md","public/THIRD_PARTY_NOTICES.md");
