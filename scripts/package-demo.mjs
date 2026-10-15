import {cp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const destination=process.argv[2];
if(!destination||!path.isAbsolute(destination))throw new Error('Provide an absolute output directory');
await mkdir(destination,{recursive:true});
await cp('public',destination,{recursive:true});
await writeFile(path.join(destination,'runtime-config.js'),"window.STELLAR_MODE = 'demo';\n");
console.log('Prepared static demo with no live-user data or credentials.');
