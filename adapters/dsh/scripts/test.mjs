import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function find(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='integration')continue;const p=resolve(dir,entry.name);if(entry.isDirectory())out.push(...await find(p));else if(/\.test\.(?:mjs|js)$/.test(entry.name))out.push(p);}return out;}
const files=(await find(resolve(root,'test'))).sort();
console.log(`Running ${files.length} test files (integration uses its isolated launcher)`);
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
