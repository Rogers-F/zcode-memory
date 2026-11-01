import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else if(/\.(?:js|mjs)$/.test(e.name))files.push(p);}return files;}
let failed=0;for(const file of [...await walk(resolve(root,'src')),...await walk(resolve(root,'scripts'))]){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0)failed++;}
console.log(`Syntax check: ${failed} failures`);if(failed)process.exitCode=1;
