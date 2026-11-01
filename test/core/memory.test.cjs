'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const {spawn}=require('node:child_process');
const core=require('../../src/core/index.cjs');const {temporary}=require('../helpers.cjs');
test('Chinese durable extraction, temporary chat exclusion, persisted digest and replay',async t=>{
  const {store}=await temporary(t);const engine=new core.MemoryEngine({store});const snapshot={session:'中文',outcome:'completed',messages:[{id:'1',role:'user',text:'记住：以后请使用中文回答。'},{id:'2',role:'user',text:'帮我跑一下测试，今天先修这个错误。'}]};
  assert.equal((await engine.extract(snapshot)).status,'disabled');await store.configure({autoExtract:true});assert.equal((await engine.extract(snapshot)).results.length,1);
  assert.equal((await new core.MemoryEngine({store}).extract(snapshot)).status,'unchanged');const snap=await store.snapshot();assert.equal(snap.facts.length,1);assert.equal(snap.facts[0].data.unified.sources[0].session,'中文');assert.equal(snap.facts[0].data.unified.host,'pi-cli');
  assert.equal(core.stableCandidate('今天先跑测试'),false);assert.ok(core.countWords('以后请使用中文回答')>=3);
});
test('semantic equivalence, explicit supersession, conflict retention and archive restore',async t=>{
  const {store}=await temporary(t);const a=await store.save({path:'language.md',body:'以后请用中文回复',type:'user'});assert.equal((await store.save({body:'请使用中文回答',type:'user'})).status,'duplicate');
  const conflict=await store.save({path:'language.md',body:'请使用英文回答',type:'user'});assert.equal(conflict.status,'conflict');assert.match((await store.read('language.md')).body,/中文/);
  await store.save({path:'language.md',body:'请使用英文回答',expectedRevision:a.revision});const snap=await store.snapshot();assert.ok(Object.keys(snap.archives).length);const archiveId=Object.keys(snap.archives)[0];const restored=await store.restore(archiveId,{expectedRevision:(await store.read('language.md')).revision});assert.equal(restored.status,'updated');assert.match((await store.read('language.md')).body,/中文/);
});
test('original unknown YAML fields and origin survive imports and updates',async t=>{
  const {store}=await temporary(t);const content='---\nname: legacy\ncustom:\n  nested: [one, two]\nmetadata:\n  type: feedback\n  originSessionId: original\n---\n\n以后发布前必须检查审批。';
  await store.save({path:'legacy.md',content},{session:'new'});const f=await store.read('legacy.md');assert.deepEqual(f.data.custom.nested,['one','two']);assert.equal(f.data.metadata.originSessionId,'original');
});
test('BM25 Chinese recall, relevance/importance, character/item/token budgets',async t=>{
  const {store}=await temporary(t);await store.save({path:'release.md',body:'发布部署必须先经过 staging，发布负责人审批。',importance:1});await store.save({path:'color.md',body:'我偏好蓝色主题',type:'user'});
  const result=await core.recall(store,'发布流程',{maxChars:100,maxItems:1,maxTokens:45});assert.equal(result.items.length,1);assert.equal(result.items[0].path,'release.md');assert.ok(result.usage.chars<=100&&result.usage.tokens<=45);assert.deepEqual((await core.recall(store,'发布',{maxChars:0,maxItems:0,maxTokens:0})).items,[]);
});
test('host/project/personal/agent isolation and read-only rejects writes',async t=>{
  const {root}=await temporary(t);const a=core.storePath({home:root,host:'pi-cli',project:'/a'}),b=core.storePath({home:root,host:'pi-cli',project:'/b'}),c=core.storePath({home:root,host:'codex-cli',project:'/a'});assert.notEqual(a.root,b.root);assert.notEqual(a.root,c.root);
  assert.notEqual(core.storePath({home:root,host:'pi-cli',project:'/a',scope:'personal'}).root,a.root);assert.notEqual(core.storePath({home:root,host:'pi-cli',project:'/a',scope:'agent',agent:'reviewer'}).root,a.root);
  const ro=new core.MemoryStore({root:a.root,readOnly:true});await assert.rejects(ro.save({body:'no'}),{code:'READ_ONLY'});assert.equal((await ro.snapshot()).facts.length,0);
});
test('traversal, symlink and case-alias protection',async t=>{
  const {store,root}=await temporary(t);for(const p of ['../out.md','x/../out.md','.git/a.md','a.MD','CON.md'])await assert.rejects(store.save({path:p,body:'no'}),{code:'UNSAFE_PATH'});
  await fs.mkdir(store.root,{recursive:true});await fs.writeFile(path.join(root,'victim.md'),'original');await fs.symlink(path.join(root,'victim.md'),path.join(store.root,'alias.md'));await assert.rejects(store.save({path:'alias.md',body:'bad'}),{code:'UNSAFE_PATH'});assert.equal(await fs.readFile(path.join(root,'victim.md'),'utf8'),'original');
});
test('copy migration is idempotent, preserves same-name conflicts, leaves source unchanged',async t=>{
  const {store,root}=await temporary(t);const source=path.join(root,'old');await fs.mkdir(source);await fs.writeFile(path.join(source,'same.md'),'---\nname: old\nmetadata:\n  type: project\n---\n\n旧版发布约定');const before=await fs.readFile(path.join(source,'same.md'),'utf8');
  await store.save({path:'same.md',body:'已有的其他约定'});const opts={sourceDir:source,sourceHost:'dsh',sourceProject:'/old'};await core.importDirectory(store,opts);const second=await core.importDirectory(store,opts);assert.equal(second.replayed,true);assert.equal((await store.snapshot()).facts.length,2);assert.equal(await fs.readFile(path.join(source,'same.md'),'utf8'),before);
});
test('durable WAL recovers facts/index after simulated crash and retry is idempotent',async t=>{
  const {store}=await temporary(t);let hit=false;store.fault=phase=>{if(phase==='after-file'&&!hit){hit=true;throw new Error('crash');}};await assert.rejects(store.save({path:'crash.md',body:'长期规则'},{operationId:'once'}),/crash/);store.fault=null;const snap=await store.snapshot();assert.equal(snap.facts.length,1);assert.match(snap.index.content,/crash.md/);assert.equal((await store.apply([{body:'长期规则'}],{operationId:'once'})).replayed,true);
});
test('cancellation before journal and late model response cannot commit; retry resumes',async t=>{
  const {store}=await temporary(t);const c=new AbortController();store.fault=phase=>{if(phase==='before-journal')c.abort();};await assert.rejects(store.save({body:'不会写入'},{signal:c.signal}),{name:'AbortError'});store.fault=null;assert.equal((await store.snapshot()).facts.length,0);
  await store.configure({autoExtract:true,modelEnabled:true});const aborter=new AbortController();const engine=new core.MemoryEngine({store,model:{async extract(){aborter.abort();return {facts:[{body:'迟到的记忆',type:'user'}]};}}});await assert.rejects(engine.extract({session:'x',messages:[{id:'1',role:'user',text:'记住我的偏好'}]},{signal:aborter.signal}),{name:'AbortError'});assert.equal((await store.snapshot()).facts.length,0);
});
test('scripted model semantic update and Dream preview/apply use shared store',async t=>{
  const {store}=await temporary(t);const old=await store.save({path:'policy.md',body:'以后发布使用 A 流程'},{origin:'extracted'});await store.configure({autoExtract:true,modelEnabled:true});let calls=0;const engine=new core.MemoryEngine({store,model:{async extract(){calls++;return {facts:[{body:'以后发布改为 B 流程',type:'project',path:'new-policy.md',relation:'supersedes',relatedPath:'policy.md'}]};},async maintain(){return {operations:[]};}}});
  await engine.extract({session:'s',messages:[{id:'1',role:'user',text:'以后发布改为 B 流程'}]});assert.equal(calls,1);assert.ok((await store.read('policy.md')).data.unified.supersededBy);assert.equal((await engine.dream()).status,'preview');assert.equal((await engine.dream({apply:true})).status,'maintained');
});
test('separate Node processes serialize distinct writes without lost facts or index entries',async t=>{
  const {store}=await temporary(t);const modulePath=path.resolve(__dirname,'../../src/core/index.cjs');
  await Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{const code=`const {MemoryStore}=require(process.argv[1]);new MemoryStore({root:process.argv[2]}).save({path:process.argv[3],body:process.argv[3]}).then(()=>{},e=>{console.error(e);process.exitCode=1})`;const child=spawn(process.execPath,['-e',code,modulePath,store.root,`fact-${i}.md`],{env:process.env,stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('exit',c=>c===0?resolve():reject(new Error(err)));})));
  const snap=await store.snapshot();assert.equal(snap.facts.length,4);assert.equal(snap.index.total,4);
});
