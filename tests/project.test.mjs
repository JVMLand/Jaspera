import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {unzipSync,strFromU8} from 'fflate';
const built=await build({stdin:{contents:"export * from './src/folder-project.ts';export * from './src/project.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {defaultProject,parseProperties,serializeProperties,sourcePath,newBinding,openFolder,saveFolder,projectArchive}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const notFound=()=>Object.assign(new Error('Missing'),{name:'NotFoundError'});
class FileHandle {
 kind='file';fail=false;mtime=1;reads=0;
 constructor(name,text=''){this.name=name;this.text=text;}
 async getFile(){return {lastModified:this.mtime,size:Buffer.byteLength(this.text),text:async()=>{this.reads++;return this.text;}};}
 async createWritable(){let data=this.text;return {write:async s=>{if(this.fail)throw new Error('Disk full');data=s;},close:async()=>{this.text=data;},abort:async()=>{}};}
}
class Directory {
 kind='directory';children=new Map();permission='granted';
 constructor(name='Project'){this.name=name;}
 async *entries(){yield* this.children;}
 async getDirectoryHandle(name,{create=false}={}){let h=this.children.get(name);if(!h&&create){h=new Directory(name);this.children.set(name,h);}if(!h)throw notFound();if(h.kind!=='directory')throw new Error('Wrong kind');return h;}
 async getFileHandle(name,{create=false}={}){let h=this.children.get(name);if(!h&&create){h=new FileHandle(name);this.children.set(name,h);}if(!h)throw notFound();if(h.kind!=='file')throw new Error('Wrong kind');return h;}
 async removeEntry(name){if(!this.children.delete(name))throw notFound();}
 async queryPermission(){return this.permission;}
 async requestPermission(){return this.permission;}
}
test('jalprj contains only properties and defaults to src/Main.jal',()=>{
 const p=defaultProject(),config=JSON.parse(serializeProperties(p));assert.deepEqual(Object.keys(config),['format','version','name','entryFile']);assert.equal(config.entryFile,'src/Main.jal');assert.equal(config.name,'Main');assert.equal(p.files[0].path,'src/Main.jal');assert.match(p.files[0].source,/public class Main/);
 delete config.entryFile;assert.equal(parseProperties(JSON.stringify(config)).entryFile,'src/Main.jal');
 for(const bad of [{...config,version:2},{...config,entryFile:'../Main.jal'},{...config,entryFile:'Main.jal'},{...config,files:[]},{...config,name:''}])assert.throws(()=>parseProperties(JSON.stringify(bad)));
 assert.throws(()=>parseProperties('{'));for(const path of ['src/../Main.jal','/src/Main.jal','Main.jal','src/a.txt'])assert.throws(()=>sourcePath(path));
});
test('folder save/open roundtrip, nested sources, rename and removal preserve unrelated files',async()=>{
 const root=new Directory(),binding=newBinding(root),p=defaultProject();p.name='日本語プロジェクト';p.files.push({path:'src/nested/Helper.jal',source:'public class nested/Helper {}'});
 const unrelated=await root.getFileHandle('README.md',{create:true});unrelated.text='keep me';
 await saveFolder(binding,p);assert.equal(JSON.parse(root.children.get('project.jalprj').text).files,undefined);
 const opened=await openFolder(root);assert.equal(opened.project.name,p.name);assert.deepEqual(opened.project.files,p.files);assert.equal(opened.project.workspace.entryFile,'src/Main.jal');
 p.files[1].path='src/Renamed.jal';await saveFolder(binding,p);assert.equal(root.children.get('src').children.get('nested').children.has('Helper.jal'),false);assert.equal(root.children.get('src').children.has('Renamed.jal'),true);
 p.files.pop();await saveFolder(binding,p);assert.equal(root.children.get('src').children.has('Renamed.jal'),false);assert.equal(unrelated.text,'keep me');
});
test('external edits, deletions and destination collisions fail before overwriting',async()=>{
 const root=new Directory(),binding=newBinding(root),p=defaultProject();await saveFolder(binding,p);
 const main=root.children.get('src').children.get('Main.jal');main.text='external edit';p.files[0].source='my edit';await assert.rejects(()=>saveFolder(binding,p),/外部/);assert.equal(main.text,'external edit');
 root.children.get('src').children.delete('Main.jal');await assert.rejects(()=>saveFolder(binding,p),/外部/);
 const other=new Directory(),src=await other.getDirectoryHandle('src',{create:true}),existing=await src.getFileHandle('Main.jal',{create:true});existing.text='existing';await assert.rejects(()=>saveFolder(newBinding(other),p),/既に存在/);assert.equal(existing.text,'existing');assert.equal(other.children.has('project.jalprj'),false);
});
test('permission denial and partial write failures can be reported and retried',async()=>{
 const root=new Directory(),binding=newBinding(root),p=defaultProject();root.permission='denied';await assert.rejects(()=>saveFolder(binding,p),/許可/);assert.equal(root.children.size,0);
 root.permission='granted';await saveFolder(binding,p);const main=root.children.get('src').children.get('Main.jal');main.fail=true;p.files[0].source+='// edited';await assert.rejects(()=>saveFolder(binding,p),/Disk full/);main.fail=false;await saveFolder(binding,p);assert.equal(main.text,p.files[0].source);
});
test('folder loading rejects missing entry, invalid source layout and ambiguous configs',async()=>{
 const root=new Directory();await assert.rejects(()=>openFolder(root),/見つかりません/);await saveFolder(newBinding(root),defaultProject());
 const config=root.children.get('project.jalprj');const original=config.text;config.text=JSON.stringify({format:'jalprj',version:1,name:'Test',entryFile:'src/Absent.jal'});await assert.rejects(()=>openFolder(root),/実行対象/);config.text=original;
 (await root.getFileHandle('second.jalprj',{create:true})).text=original;await assert.rejects(()=>openFolder(root),/複数/);
});
test('ZIP export contains metadata and independent source files, never embedded source JSON',async()=>{
 const p=defaultProject(),zip=unzipSync(await projectArchive(p));assert.deepEqual(Object.keys(zip).sort(),['project.jalprj','src/Main.jal']);assert.deepEqual(JSON.parse(strFromU8(zip['project.jalprj'])),JSON.parse(serializeProperties(p)));assert.equal(strFromU8(zip['src/Main.jal']),p.files[0].source);
});

test('plain folders and timestamp polling share loading, including empty folders',async()=>{
 const root=new Directory();let state=await openFolder(root,false);assert.equal(state.binding.properties,false);assert.equal(state.project.files.length,0);
 const file=await root.getFileHandle('Main.jal',{create:true});file.text='public class Main {}';state=await openFolder(root,false,state.binding);assert.equal(state.project.workspace.entryFile,'Main.jal');const reads=file.reads;
 state=await openFolder(root,false,state.binding);assert.equal(file.reads,reads);
 file.text='public class Test {}';file.mtime++;state=await openFolder(root,false,state.binding);assert.equal(state.project.files[0].source,file.text);assert.equal(file.reads,reads+1);
 state.project.files[0].source+='// browser';await saveFolder(state.binding,state.project);assert.equal(root.children.has('project.jalprj'),false);
 await root.removeEntry('Main.jal');state=await openFolder(root,false,state.binding);assert.equal(state.project.files.length,0);
});
