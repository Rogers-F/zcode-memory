'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {temporary}=require('../helpers.cjs');const core=require('../../src/core/index.cjs');
test('both legacy plugin copies preserve fields, conflicts, explicit project mapping and previous opt-in choices',async t=>{
  const {store,root}=await temporary(t);const sources=[];
  for(const [host,body] of [['pi-desktop','发布必须先经过 staging'],['dsh','发布前必须等待产品经理审批']]){
    const dir=path.join(root,host);await fs.mkdir(dir);const content=`---\nname: release\ncustom: ${host}\nmetadata:\n  type: feedback\n  originSessionId: old-${host}\n---\n\n${body}`;
    await fs.writeFile(path.join(dir,'same.md'),content);sources.push({dir,host,content});
    const result=await core.importDirectory(store,{sourceDir:dir,sourceHost:host,sourceProject:'/explicit-old-project',settings:host==='pi-desktop'?{autoExtract:true}:{enabled:false,extractionEnabled:true}});assert.equal(result.results.length,1);
  }
  const snap=await store.snapshot();assert.equal(snap.facts.length,2);assert.equal(snap.settings.autoExtract,false);assert.ok(snap.facts.some(f=>f.data.unified.conflictWith));
  for(const source of sources){const result=await core.importDirectory(store,{sourceDir:source.dir,sourceHost:source.host,sourceProject:'/explicit-old-project'});assert.equal(result.replayed,true);assert.equal(await fs.readFile(path.join(source.dir,'same.md'),'utf8'),source.content);assert.ok(snap.facts.some(f=>f.data.custom===source.host&&f.data.metadata.originSessionId==='old-'+source.host));}
  await assert.rejects(core.importDirectory(store,{sourceDir:sources[0].dir,sourceHost:'pi-desktop'}),{code:'MAPPING_REQUIRED'});
  const exchange=await store.export();exchange.facts[0].content+='tampered';const damaged=await core.importExchange(store,exchange,{sourceProject:'/target'});assert.equal(damaged.skipped[0].code,'INVALID_EXCHANGE');assert.ok(damaged.results.length);
});
test('multi-transaction copy import is idempotent beyond fifty facts',async t=>{
  const {store,root}=await temporary(t);const dir=path.join(root,'legacy');await fs.mkdir(dir);
  for(let i=0;i<55;i++)await fs.writeFile(path.join(dir,`item-${i}.md`),`---\nmetadata:\n  type: reference\n---\n\n长期文档引用 token${i}`);
  const options={sourceDir:dir,sourceHost:'pi-desktop',sourceProject:'/mapped'};await core.importDirectory(store,options);const first=await store.snapshot();
  const second=await core.importDirectory(store,options);assert.equal(second.replayed,true);const after=await store.snapshot();assert.equal(after.facts.length,55);assert.equal(after.generation,first.generation);
});
test('ranking combines relevance, recency and importance; recall provenance stays compact',async t=>{
  const now=Date.parse('2026-10-30T00:00:00Z');const fact=(name,time,importance)=>({path:name,type:'project',body:'项目发布审批',data:{unified:{updatedAt:time,importance}}});
  const recent=fact('recent.md','2026-10-30T00:00:00Z',0.5),old=fact('old.md','2020-01-01T00:00:00Z',0.5);assert.equal(core.rank([old,recent],'发布',{now})[0].path,'recent.md');
  const high=fact('high.md','2026-10-30T00:00:00Z',1),low=fact('low.md','2026-10-30T00:00:00Z',0);assert.equal(core.rank([low,high],'发布',{now})[0].path,'high.md');
  const {store}=await temporary(t);await store.save({path:'source.md',body:'以后项目发布先审批'},{session:'source'});const result=await core.recall(store,'发布');assert.equal(result.items[0].source.sourceCount,1);assert.equal(result.items[0].source.sources,undefined);assert.equal(result.items[0].text,undefined);
});
test('native raw updates merge legacy fields, preserve original session and refresh a stale index description',async t=>{
  const {store}=await temporary(t);const saved=await store.save({path:'metadata.md',content:'---\nname: important-name\ncustom:\n  keep: old-value\nmetadata:\n  type: feedback\n  originSessionId: original-session\n  extra: preserved\n---\n\n旧流程先找 A'});
  await store.writeRaw('metadata.md','---\ncustom:\n  added: new-value\nmetadata:\n  originSessionId: replacement-attempt\n---\n\n新流程先找 B',{expectedRevision:saved.revision,session:'update'});
  const fact=await store.read('metadata.md');assert.deepEqual(fact.data.custom,{keep:'old-value',added:'new-value'});assert.equal(fact.data.metadata.originSessionId,'original-session');assert.equal(fact.data.metadata.extra,'preserved');assert.equal(fact.type,'feedback');assert.equal(fact.data.name,'important-name');assert.match((await store.read('MEMORY.md')).content,/新流程/);assert.doesNotMatch((await store.read('MEMORY.md')).content,/旧流程/);
});
test('manual Dream previews then consolidates legacy duplicates through restorable archives',async t=>{
  const {store}=await temporary(t);await fs.mkdir(store.root,{recursive:true});
  for(const filename of ['first.md','duplicate.md'])await fs.writeFile(path.join(store.root,filename),'---\nmetadata:\n  type: user\n  originSessionId: original\n---\n\n以后请使用中文回答');
  const engine=new core.MemoryEngine({store});const preview=await engine.dream();assert.equal(preview.status,'preview');assert.equal(preview.operations.length,1);assert.equal((await store.snapshot()).facts.length,2);
  const applied=await engine.dream({apply:true});assert.equal(applied.results[0].status,'forgotten');const snap=await store.snapshot();assert.equal(snap.facts.length,1);assert.equal(Object.values(snap.archives)[0].reason,'forget');
  engine.close();
});
