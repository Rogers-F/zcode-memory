'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn}=require('node:child_process');
const {temporary}=require('../helpers.cjs');const core=require('../../src/core/index.cjs');
const modulePath=path.resolve(__dirname,'../../src/core/index.cjs');
function child(code,args=[]){return new Promise((resolve,reject)=>{
  const proc=spawn(process.execPath,['-e',code,modulePath,...args],{env:process.env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  proc.stdout.on('data',b=>stdout+=b);proc.stderr.on('data',b=>stderr+=b);proc.on('error',reject);
  proc.on('close',(exit,signal)=>resolve({exit,signal,stdout,stderr}));
});}
test('SIGKILL after durable journal: dead writer is reaped; another process completes one transaction',async t=>{
  const {store}=await temporary(t);
  const code=`const {MemoryStore}=require(process.argv[1]);const store=new MemoryStore({root:process.argv[2],fault(phase){if(phase==='after-journal')process.kill(process.pid,'SIGKILL')}});store.save({path:'durable.md',body:'长期发布约定'},{operationId:'durable-once'}).catch(e=>{console.error(e);process.exitCode=1})`;
  const result=await child(code,[store.root]);assert.equal(result.signal,'SIGKILL');
  const snap=await store.snapshot();assert.equal(snap.facts.length,1);assert.match(snap.index.content,/durable.md/);
  assert.equal((await store.apply([{body:'不会再写一份'}],{operationId:'durable-once'})).replayed,true);
  assert.deepEqual(await fs.readdir(path.join(store.root,'.unified/locks')),[]);
});
test('four processes updating the same observed revision produce one update and three explicit stale errors',async t=>{
  const {store}=await temporary(t);const fact=await store.save({path:'shared.md',body:'原始版本'});
  const code=`const {MemoryStore}=require(process.argv[1]);new MemoryStore({root:process.argv[2]}).save({path:'shared.md',body:process.argv[4],expectedRevision:process.argv[3]}).then(v=>console.log(JSON.stringify(v)),e=>console.log(JSON.stringify({error:e.code})))`;
  const results=await Promise.all(Array.from({length:4},(_,i)=>child(code,[store.root,fact.revision,'新版本 '+i])));
  const values=results.map(r=>{assert.equal(r.exit,0,r.stderr);return JSON.parse(r.stdout);});
  assert.equal(values.filter(v=>v.status==='updated').length,1);assert.equal(values.filter(v=>v.error==='FILE_CHANGED').length,3);
  const snap=await store.snapshot();assert.equal(snap.facts.length,1);assert.equal(Object.keys(snap.archives).length,1);
});
test('abort after WAL finishes a consistent commit; retry replays instead of writing again',async t=>{
  const {store}=await temporary(t);const controller=new AbortController();
  store.fault=phase=>{if(phase==='after-journal')controller.abort();};
  await store.save({path:'committed.md',body:'明确的长期记忆'},{signal:controller.signal,operationId:'after-wal'});store.fault=null;
  assert.equal((await store.snapshot()).facts.length,1);assert.equal((await store.apply([],{operationId:'after-wal'})).replayed,true);
});
test('per-sentence Chinese extraction excludes adjacent temporary chat and credential assignments',async t=>{
  const {store}=await temporary(t);const engine=new core.MemoryEngine({store});
  await engine.extract({session:'mixed',messages:[{id:'1',role:'user',text:'以后请用中文回答。今天先帮我跑测试。记住 api_key: fake-test-secret。'}]},{manual:true});
  const snap=await store.snapshot();assert.equal(snap.facts.length,1);assert.match(snap.facts[0].body,/中文/);assert.doesNotMatch(snap.facts[0].body,/测试|secret/);
});
test('extraction budget refusal preserves cursor; failed inference is counted and a retry resumes',async t=>{
  const {store}=await temporary(t);await store.configure({autoExtract:true,modelEnabled:true,extraction:{maxInputChars:2,maxExistingChars:0}});
  let calls=0;const engine=new core.MemoryEngine({store,model:{async extract(input){calls++;assert.equal(input.maxCalls,1);assert.deepEqual(input.existing,[]);if(calls===1)throw new Error('scripted failure');return {facts:[{body:'以后发布使用 staging',type:'project',action:'forget'}]};}}});
  const snapshot={session:'budget',messages:[{id:'1',role:'user',text:'记住：以后发布使用 staging'}]};
  await assert.rejects(engine.extract(snapshot),{code:'EXTRACTION_BUDGET'});assert.equal(calls,0);
  await store.configure({extraction:{maxInputChars:1000}});await assert.rejects(engine.extract(snapshot),/scripted failure/);
  assert.equal((await store.snapshot()).checkpoints['extract:budget'],undefined);
  await engine.extract(snapshot);const snap=await store.snapshot();assert.equal(snap.stats.modelCalls,2);assert.equal(snap.facts.length,1);
  await engine.extract(snapshot);assert.equal(calls,2);
});
test('coalesced scheduled snapshots are captured eagerly; latest pending delta commits once',async t=>{
  const {store}=await temporary(t);await store.configure({autoExtract:true,modelEnabled:true});
  let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let count=0;
  const engine=new core.MemoryEngine({store,model:{async extract({messages}){if(++count===1){entered();await gate;}return {facts:messages.flatMap(m=>core.extractCandidates(m.text))};}}});
  const first=engine.schedule({session:'queue',messages:[{id:'1',role:'user',text:'记住：以后中文回答'}]});await ready;
  const second=engine.schedule({session:'queue',messages:[{id:'1',role:'user',text:'记住：以后中文回答'},{id:'2',role:'user',text:'临时状态'}]});
  const snapshot={session:'queue',messages:[{id:'1',role:'user',text:'记住：以后中文回答'},{id:'3',role:'user',text:'记住：项目发布先审批'}]};
  const third=engine.schedule(snapshot);snapshot.messages[1].text='被外部修改的快照';release();
  assert.equal((await second).status,'coalesced');await first;await third;await engine.drain();
  const snap=await store.snapshot();assert.equal(snap.facts.length,2);assert.ok(snap.facts.some(f=>f.body.includes('先审批')));assert.equal(count,2);engine.close();
});
test('recall reads selected bodies only, catalog is body-free, and explicit scopes cannot leak',async t=>{
  const {root}=await temporary(t);const {HostMemory}=require('../../src/protocol/service.cjs');
  const a=new HostMemory({home:root,host:'pi-cli',project:'/a'}),b=new HostMemory({home:root,host:'pi-cli',project:'/b'});
  await a.tool('memory_save',{body:'项目发布使用 staging',path:'release.md'});await a.tool('memory_save',{body:'喜欢海蓝色主题',path:'theme.md'});
  await a.tool('memory_save',{body:'个人偏好咖啡',scope:'personal'});await a.tool('memory_save',{body:'代理专用审批约定',scope:'agent',agent:'reviewer'});
  const store=a.store(),original=store.read.bind(store);let reads=0;store.read=(...args)=>{reads++;return original(...args);};
  assert.ok((await store.catalog()).facts.every(f=>f.body===undefined));const result=await a.tool('memory_recall',{query:'发布',maxItems:1});assert.equal(result.items.length,1);assert.equal(reads,1);
  assert.equal((await b.tool('memory_recall',{query:'发布'})).items.length,0);assert.equal((await a.tool('memory_recall',{query:'咖啡'})).items.length,1);
  assert.equal((await a.tool('memory_recall',{query:'咖啡',scope:'personal'})).items.length,1);await a.close();await b.close();
});
test('model supersession and Dream edits reject concurrent changes using the supplied revisions',async t=>{
  const {store}=await temporary(t);const initial=await store.save({path:'policy.md',body:'旧发布约定'});await store.configure({autoExtract:true,modelEnabled:true});
  const engine=new core.MemoryEngine({store,model:{async extract(){await store.save({path:'policy.md',body:'人工改过的约定',expectedRevision:initial.revision});return {facts:[{body:'以后发布改为新流程',relation:'supersedes',relatedPath:'policy.md'}]};}}});
  await assert.rejects(engine.extract({session:'stale',messages:[{role:'user',text:'记住以后发布改为新流程'}]}),{code:'FILE_CHANGED'});
  assert.equal((await store.snapshot()).facts.length,1);assert.match((await store.read('policy.md')).body,/人工/);
});
test('edited user content at an existing message ID is detected after cursor advancement',async t=>{
  const {store}=await temporary(t);const engine=new core.MemoryEngine({store});
  await engine.extract({session:'edit',messages:[{id:'same',role:'user',text:'记住：以后用中文回答'}]},{manual:true});
  await engine.extract({session:'edit',messages:[{id:'same',role:'user',text:'记住：以后改用英文回答'}]},{manual:true});
  const facts=(await store.snapshot()).facts;assert.equal(facts.length,2);assert.ok(facts.some(f=>f.data.unified.supersededBy));
});
test('semantic duplicate retains additional session provenance and migrated legacy fields',async t=>{
  const {store}=await temporary(t);await store.save({path:'first.md',body:'以后请用中文回答',type:'user'},{session:'first'});
  const result=await store.save({path:'other.md',content:'---\ncustom: retained-from-second-source\nmetadata:\n  type: user\n  originSessionId: second-origin\n---\n\n请使用中文回复',importKey:'second-import'},{session:'migration',source:{host:'dsh',project:'/old'}});
  assert.equal(result.status,'duplicate');assert.equal(result.path,'first.md');
  const snap=await store.snapshot();assert.equal(snap.facts.length,1);const sources=snap.facts[0].data.unified.sources;
  assert.equal(sources.length,2);assert.equal(sources[1].legacyFields.custom,'retained-from-second-source');assert.equal(sources[1].legacyFields.metadata.originSessionId,'second-origin');
  assert.equal(Object.values(snap.archives)[0].reason,'provenance');
});
test('Dream model cannot overwrite a memory changed during proposal generation',async t=>{
  const {store}=await temporary(t);const fact=await store.save({path:'dream.md',body:'长期发布约定'});await store.configure({modelEnabled:true});
  const engine=new core.MemoryEngine({store,model:{async maintain(){await store.save({path:'dream.md',body:'人工确认后的约定',expectedRevision:fact.revision});return {operations:[{action:'save',path:'dream.md',body:'模型的旧提案'}]};}}});
  await assert.rejects(engine.dream({apply:true,useModel:true}),{code:'FILE_CHANGED'});assert.match((await store.read('dream.md')).body,/人工确认/);
});
test('index compatibility cap reports omitted facts while all remain searchable',async t=>{
  const {store}=await temporary(t);await fs.mkdir(store.root,{recursive:true});
  for(let i=0;i<205;i++)await fs.writeFile(path.join(store.root,`fact-${String(i).padStart(3,'0')}.md`),`---\nname: fact-${i}\ndescription: example-${i}\nmetadata:\n  type: project\n---\n\n长期项目编号 unique${i}`);
  await store.apply([]);const snap=await store.catalog();assert.equal(snap.index.total,205);assert.ok(snap.index.omitted>=5);assert.ok(snap.index.content.split('\n').filter(Boolean).length<=200);assert.ok(snap.index.content.length<=25000);
  assert.equal((await core.recall(store,'unique204',{maxItems:1})).items[0].path,'fact-204.md');
});
test('unsafe index and filesystem permissions refuse before a durable journal is published',async t=>{
  const {store,root}=await temporary(t);await store.save({path:'safe.md',body:'已有安全内容'});
  const index=path.join(store.root,'MEMORY.md'),victim=path.join(root,'victim.md');await fs.writeFile(victim,'untouched');await fs.unlink(index);await fs.symlink(victim,index);
  await assert.rejects(store.save({path:'unsafe.md',body:'这次应拒绝'}),{code:'UNSAFE_PATH'});await assert.rejects(fs.stat(path.join(store.root,'.unified/journal.json')),{code:'ENOENT'});assert.equal(await fs.readFile(victim,'utf8'),'untouched');
  await fs.unlink(index);await store.apply([]);
  if(process.platform!=='win32'&&process.getuid?.()!==0){
    await fs.chmod(store.root,0o500);try{await assert.rejects(store.save({path:'denied.md',body:'权限应拒绝'}),e=>['EACCES','EPERM'].includes(e.code));}finally{await fs.chmod(store.root,0o700);}
    await assert.rejects(fs.stat(path.join(store.root,'.unified/journal.json')),{code:'ENOENT'});
  }
  assert.equal((await store.snapshot()).facts.length,1);
});
test('host-constrained imports reject outside roots and subagents cannot write a project store',async t=>{
  const {root,store}=await temporary(t);const {HostMemory}=require('../../src/protocol/service.cjs');const service=new HostMemory({home:root,host:'dsh',project:root,importRoots:[path.join(root,'allowed')]});
  await assert.rejects(service.tool('memory_import',{sourceDir:root,sourceHost:'dsh',sourceProject:'/source'}),{code:'PERMISSION_DENIED'});
  const result=await new core.MemoryEngine({store}).extract({session:'child',isSubagent:true,agentScope:'project',messages:[{role:'user',text:'记住以后中文回答'}]},{manual:true});assert.equal(result.status,'unsupported-subagent');assert.equal((await store.snapshot()).facts.length,0);await service.close();
});
test('cancel just before journal publication leaves no durable transaction and retry succeeds',async t=>{
  const {store}=await temporary(t);const controller=new AbortController();store.fault=phase=>{if(phase==='before-journal-publish')controller.abort();};
  await assert.rejects(store.save({path:'fenced.md',body:'长期记忆'},{operationId:'publication',signal:controller.signal}),{name:'AbortError'});store.fault=null;
  assert.equal((await store.snapshot()).facts.length,0);await assert.rejects(fs.stat(path.join(store.root,'.unified/journal.json')),{code:'ENOENT'});
  assert.equal((await store.save({path:'fenced.md',body:'长期记忆'},{operationId:'publication'})).status,'saved');
});
test('closing aborts a model that ignores its signal and fences its late response; a new engine resumes',async t=>{
  const {store}=await temporary(t);await store.configure({autoExtract:true,modelEnabled:true});let entered,late;
  const ready=new Promise(resolve=>entered=resolve),response=new Promise(resolve=>late=resolve);
  const engine=new core.MemoryEngine({store,model:{async extract(){entered();return response;}}});
  const snapshot={session:'close',messages:[{id:'1',role:'user',text:'记住以后项目先审批'}]};const result=engine.schedule(snapshot).catch(error=>error);await ready;engine.close();
  assert.equal((await result).name,'AbortError');await engine.drain();late({facts:[{body:'迟到不应写入的记忆'}]});await new Promise(resolve=>setImmediate(resolve));assert.equal((await store.snapshot()).facts.length,0);
  const resumed=new core.MemoryEngine({store});await resumed.extract(snapshot);assert.equal((await store.snapshot()).facts.length,1);resumed.close();
});
