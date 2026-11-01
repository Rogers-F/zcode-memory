'use strict';
// Synthetic data only. A fresh child process measures each cold startup.
const fs=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
if(process.argv[2]==='--child'){
 const original=fs.open;let bodyReads=0,syncs=0,renames=0;const rename=fs.rename;fs.rename=async(...args)=>{renames++;return rename(...args);};fs.open=async(...args)=>{if(/bench-\d+\.md$/u.test(String(args[0])))bodyReads++;const fd=await original(...args),sync=fd.sync.bind(fd);fd.sync=async()=>{syncs++;return sync();};return fd;};
 const start=performance.now(),{MemoryStore,recall}=require('../src/core/index.cjs');const loaded=performance.now();
 (async()=>{const store=new MemoryStore({root:process.argv[3],host:'pi-cli',project:'/synthetic'});const result=await recall(store,'unique999',{maxItems:1});const end=performance.now();if(result.items[0]?.path!=='bench-999.md'||syncs||renames||bodyReads!==1)throw new Error('Cold recall regression');console.log(JSON.stringify({moduleLoadMs:loaded-start,recallMs:end-loaded,totalMs:end-start,bodyReads,fsyncs:syncs,renames,items:result.items.length}));})().catch(e=>{console.error(e);process.exitCode=1;});
}else (async()=>{
 const base=path.join(root,'.work/benchmark');await fs.mkdir(base,{recursive:true});const work=await fs.mkdtemp(path.join(base,'run-')),data=path.join(work,'memory');await fs.mkdir(data);
 for(let offset=0;offset<1000;offset+=32)await Promise.all(Array.from({length:Math.min(32,1000-offset)},(_,n)=>{const i=offset+n;return fs.writeFile(path.join(data,`bench-${i}.md`),`---\nname: reference${i}\ndescription: independent unique${i}\nmetadata:\n  type: reference\n---\n\nDocument unique${i} contains synthetic reference ${i}.`);}));
 const {MemoryStore}=require('../src/core/index.cjs');await new MemoryStore({root:data,host:'pi-cli',project:'/synthetic'}).apply([]);
 const samples=[];const env={PATH:process.env.PATH,HOME:path.join(work,'home'),TMPDIR:work};await fs.mkdir(env.HOME);
 for(let i=0;i<5;i++){const r=spawnSync(process.execPath,[__filename,'--child',data],{cwd:root,env,encoding:'utf8',timeout:30000});if(r.status!==0)throw new Error(r.stderr);samples.push(JSON.parse(r.stdout));}
 const sorted=samples.map(s=>s.totalMs).sort((a,b)=>a-b);const report={status:'passed',node:process.version,platform:process.platform,arch:process.arch,facts:1000,runs:5,kind:'fresh process, warm OS filesystem cache; local BM25; token-like estimate, not a real tokenizer',medianTotalMs:sorted[2],maxTotalMs:sorted.at(-1),samples,work};await fs.writeFile(path.join(base,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
