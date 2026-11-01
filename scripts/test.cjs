'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');const home=path.join(root,'.work','test-home'),tmp=path.join(root,'.work','tmp');fs.mkdirSync(home,{recursive:true});fs.mkdirSync(tmp,{recursive:true});
const env={PATH:process.env.PATH,HOME:home,USERPROFILE:home,TMPDIR:tmp,TMP:tmp,TEMP:tmp,ZCODE_MEMORY_TEST_ROOT:tmp,NODE_COMPILE_CACHE:path.join(root,'.work','compile-cache')};
const group=process.argv[2]??'unit';const dirs=group==='integration'?['test/integration']:['test/core','test/adapters'];const files=dirs.flatMap(d=>fs.readdirSync(path.join(root,d)).filter(n=>n.endsWith('.test.cjs')).map(n=>path.join(root,d,n)));
if(!files.length)throw new Error('No tests discovered');const r=spawnSync(process.execPath,['--test','--test-reporter=spec',...files],{cwd:root,env,stdio:'inherit'});process.exitCode=r.status??1;
