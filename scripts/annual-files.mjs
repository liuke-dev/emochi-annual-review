import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat,realpath,mkdir,writeFile,chmod} from 'node:fs/promises';
export const repository=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const inside=(root,value)=>value===root||value.startsWith(root+path.sep);
export async function privateOutput(value){
 const target=path.resolve(value);let existing=target;
 while(true){try{const stat=await lstat(existing);if(stat.isSymbolicLink())throw new Error('Private output must not be a symbolic link');break;}catch(e){if(e.code!=='ENOENT')throw e;const parent=path.dirname(existing);if(parent===existing)throw e;existing=parent;}}
 if(inside(repository,target)||inside(repository,await realpath(existing)))throw new Error('Personal data output must be outside the Git checkout');
 return target;
}
export async function writePrivateJSON(filename,data){const target=await privateOutput(filename);await mkdir(path.dirname(target),{recursive:true,mode:0o700});await writeFile(target,JSON.stringify(data,null,2)+'\n',{mode:0o600});await chmod(target,0o600);return target;}
