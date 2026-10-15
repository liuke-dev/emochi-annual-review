import {cp,mkdir,readFile,writeFile,readdir,lstat,chmod} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import '../public/intro-data.js';
import {privateOutput,repository} from './annual-files.mjs';
async function asset(dir,name){
 if(!dir||!name||path.basename(name)!==name)throw new Error('Missing or invalid private media asset');
 const filename=path.join(dir,name),s=await lstat(filename);
 if(!s.isFile()||s.isSymbolicLink()||s.size===0||s.size>5*1024*1024)throw new Error('Private media must be a regular file below 5 MiB');
 return filename;
}
export async function exportSnapshot({data,outputDir,narrationDir,callAudioDir,publicDir=path.join(repository,'public')}){
 if(data?.demo!==false||!Array.isArray(data.galaxies)||!['ready','partial'].includes(data.status))throw new Error('A normalized real annual response is required');
 const out=await privateOutput(outputDir);
 try{if((await readdir(out)).length)throw new Error('Use a new empty output directory to prevent mixing users');}catch(e){if(e.code!=='ENOENT')throw e;}
 const snapshot=structuredClone(data),copies=[];
 delete snapshot.introAudioUrls;delete snapshot.introAudioSourceKey;delete snapshot.introDurationSeconds;
 if(narrationDir){
  const bundle=JSON.parse(await readFile(path.join(narrationDir,'bundle.json'),'utf8'));
  if(bundle.sourceKey!==globalThis.StellarIntro.sourceKey(snapshot))throw new Error('Narration belongs to different user statistics');
  if(!Array.isArray(bundle.files)||bundle.files.length!==5)throw new Error('Exactly five narration clips are required');
  snapshot.introAudioUrls=[];
  for(let i=0;i<5;i++){
   const item=bundle.files[i],name=`intro-space-${i}.mp3`;
   if(item.file!==name||!Number.isFinite(item.duration)||item.duration<=0)throw new Error('Invalid narration manifest');
   copies.push([await asset(narrationDir,name),'assets/personal-intro/'+name]);snapshot.introAudioUrls.push('assets/personal-intro/'+name);
  }
  snapshot.introAudioSourceKey=bundle.sourceKey;
  snapshot.introDurationSeconds=Math.ceil(bundle.files.slice(0,4).reduce((n,f)=>n+f.duration,0)+Math.max(9,bundle.files[4].duration)+3.8);
 }
 const media=new Map();
 for(const g of snapshot.galaxies)for(const bot of g.bots)for(const segment of bot.callSegments||[]){
  if(!segment.audioUrl)continue;
  const match=segment.audioUrl.match(/^\/v1\/audio\/([A-Za-z0-9_-]{1,100})$/);
  if(!match)throw new Error('Unsupported protected audio route');
  const name=match[1]+'.mp3',dest='assets/call/'+name;
  if(!media.has(dest))media.set(dest,await asset(callAudioDir,name));
  segment.audioUrl=dest;
 }
 copies.push(...[...media].map(([dest,src])=>[src,dest]));
 snapshot.delivery='snapshot';
 await mkdir(out,{recursive:true,mode:0o700});await chmod(out,0o700);await cp(publicDir,out,{recursive:true});
 for(const [src,dest]of copies){await mkdir(path.dirname(path.join(out,dest)),{recursive:true});await cp(src,path.join(out,dest));}
 await writeFile(path.join(out,'runtime-config.js'),"window.STELLAR_MODE = 'snapshot';\n");
 await writeFile(path.join(out,'snapshot.js'),'window.MEMORY_DATA = '+JSON.stringify(snapshot).replace(/</g,'\\u003c')+';\n',{mode:0o600});
 return {mode:'snapshot',galaxies:snapshot.galaxies.length,mediaFiles:copies.length,hasNarration:globalThis.StellarIntro.matches(snapshot)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [dataPath,outputDir,narrationDir,callAudioDir]=process.argv.slice(2);
 if(!dataPath||!outputDir)throw new Error('Usage: node scripts/export-annual-snapshot.mjs DATA_JSON OUTPUT_DIR [NARRATION_DIR] [CALL_AUDIO_DIR]');
 console.log(JSON.stringify(await exportSnapshot({data:JSON.parse(await readFile(dataPath,'utf8')),outputDir,narrationDir,callAudioDir})));
}
