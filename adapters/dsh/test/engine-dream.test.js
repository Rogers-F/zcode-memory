/** SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode tests/{memory-dream,runtime-memory-dream}.test.ts.
 * Modifications: node:test, explicit invocation, real PID locks and normalized transcript adapters.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMemoryEngine, createMemoryDream, createMemoryRecall, evaluateAutoDreamTiming, selectProjectDreamSessions, collectDreamTouchedPaths } from '../src/engine/index.js';
import { snapshot, user, workspace, memoryRoot, tools, model, temporaryStorage, storageExecutor, deferred } from './engine-helpers.js';
const day=86400000;
function options(count=5) { return {currentSessionId:'current',transcriptRoot:join(workspace,'transcripts'),listSessions:async()=>Array.from({length:count},(_,index)=>({id:String(index),directory:workspace,taskType:'interactive'})),statTranscript:async()=>({kind:'file',mtimeMs:Date.now()})}; }

test('Dream timing is exactly 24h since consolidation and 10m between scans',()=>{
  assert.deepEqual(evaluateAutoDreamTiming({lastConsolidatedAtMs:day,lastScanAtMs:0,nowMs:2*day-1}),{decision:'skip',reason:'minimum-interval'});
  assert.deepEqual(evaluateAutoDreamTiming({lastConsolidatedAtMs:0,lastScanAtMs:2*day,nowMs:2*day+599999}),{decision:'skip',reason:'scan-throttled'});
  assert.deepEqual(evaluateAutoDreamTiming({lastConsolidatedAtMs:day,lastScanAtMs:2*day-600000,nowMs:2*day}),{decision:'scan'});
});
test('Dream selects other main/fork sessions by identity when present, otherwise original workspace',()=>{
  const sessions=[{id:'current',directory:workspace},{id:'main',directory:workspace},{id:'fork',directory:workspace,taskType:'fork'},{id:'sub',directory:workspace,taskType:'subagent'},{id:'different',directory:workspace+'-other',workspaceID:'id'},{id:'matching',directory:workspace,workspaceID:'id'}];
  assert.deepEqual(selectProjectDreamSessions({currentSessionId:'current',sessions,workspacePath:workspace}).map(session=>session.id),['main','fork','matching']);
  assert.deepEqual(selectProjectDreamSessions({currentSessionId:'current',sessions,workspacePath:workspace,workspaceIdentity:' id '}).map(session=>session.id),['different','matching']);
});
test('Dream never auto-runs and requires five changed real transcripts rather than session update dates',async t=>{
  const storage=await temporaryStorage(t);let requests=0;const engine=createMemoryEngine({storage});
  engine.schedule({...snapshot('skip',[user('skip','ok')]),model:model(async()=>{requests++;return{text:'done'};})});await engine.drain();assert.equal(requests,0);assert.equal(await storage.readDreamLastConsolidatedAt(),0);
  const input={...snapshot('dream'),model:model(async()=>{requests++;return{text:'done'};}),executeTool:storageExecutor(storage)};
  const result=await engine.runDream(input,{...options(),statTranscript:async id=>({kind:'file',mtimeMs:id==='4'?0:Date.now()})});assert.equal(result.reason,'insufficient-sessions');assert.equal(requests,0);
  assert.equal((await engine.runDream(input,options())).reason,'scan-throttled');
});
test('explicit Dream uses real lock, real Write, source prompt, invalidation and one-shot memory_update',async t=>{
  const storage=await temporaryStorage(t),readState=new Map();const file=join(storage.rootDir,'fact.md');await storage.write(file,'old',{readState});let count=0;const requests=[];
  const engine=createMemoryEngine({storage,readState});const input={...snapshot('dream'),memoryRoot:storage.rootDir,readState,model:model(async request=>{requests.push(request);return ++count===1?{text:'',toolCalls:[{id:'update',name:'Write',input:{file_path:file,content:'new durable fact'}}]}:{text:'consolidated'};}),executeTool:storageExecutor(storage)};
  const result=await engine.runDream(input,options());assert.equal(result.decision,'completed');assert.equal(result.filesTouched,1);assert.equal((await storage.read(file)).content,'new durable fact');assert.match(requests[0].messages.at(-1).content,/# Dream: Memory Consolidation/);
  const lock=await readFile(join(storage.rootDir,'.consolidate-lock'),'utf8');assert.equal(Number.parseInt(lock,10),process.pid);assert.equal(readState.size,0);
  const update=engine.consumeMemoryUpdate();assert.equal(update.name,'memory_update');assert.match(update.content,/now stale relative to disk/);assert.equal(update.update.filesTouched,1);assert.equal(engine.consumeMemoryUpdate(),undefined);
  assert.equal((await engine.runDream(input,options())).reason,'minimum-interval');
});
test('fresh live PID lock blocks ownership and failed Dream restores old timestamp and clears owner',async t=>{
  const storage=await temporaryStorage(t);const lock=join(storage.rootDir,'.consolidate-lock');
  const prior=await storage.acquireDreamLock();assert.equal(prior,0);assert.equal(await storage.acquireDreamLock(),null);
  const previous=Date.now()-2*day;await utimes(lock,previous/1000,previous/1000);
  const dream=createMemoryDream({storage});const result=await dream.run({...snapshot('dream'),memoryRoot:storage.rootDir,model:model(async()=>{throw new Error('provider failed');}),executeTool:storageExecutor(storage)},options());
  assert.equal(result.decision,'error');assert.equal(await readFile(lock,'utf8'),'');assert.ok(Math.abs((await stat(lock)).mtimeMs-previous)<2);
});
test('failed first Dream unlinks newly acquired lock and emits no update',async t=>{
  const storage=await temporaryStorage(t);const engine=createMemoryEngine({storage});
  const result=await engine.runDream({...snapshot('dream'),memoryRoot:storage.rootDir,model:model(async()=>{throw new Error('failed');})},options());assert.equal(result.decision,'error');assert.equal(await storage.readDreamLastConsolidatedAt(),0);assert.equal(engine.consumeMemoryUpdate(),undefined);
});
test('source filesTouched counts an allowed Edit attempt even if read-before-edit rejects it',async t=>{
  const storage=await temporaryStorage(t);await storage.write('fact.md','old');let count=0;const engine=createMemoryEngine({storage});
  const result=await engine.runDream({...snapshot('dream'),memoryRoot:storage.rootDir,model:model(async()=>++count===1?{text:'',toolCalls:[{id:'edit',name:'Edit',input:{file_path:join(storage.rootDir,'fact.md'),old_string:'old',new_string:'new'}}]}:{text:'done'}),executeTool:storageExecutor(storage)},options());
  assert.equal(result.filesTouched,1);assert.equal((await storage.read('fact.md')).content,'old');assert.equal(engine.consumeMemoryUpdate().update.paths.length,1);
});
test('Dream cancellation fences late writes and restores lock',async t=>{
  const storage=await temporaryStorage(t),entered=deferred(),gate=deferred();let writes=0;const engine=createMemoryEngine({storage});
  const running=engine.runDream({...snapshot('dream'),memoryRoot:storage.rootDir,model:model(async()=>{entered.resolve();await gate.promise;return{text:'',toolCalls:[{id:'late',name:'Write',input:{file_path:join(storage.rootDir,'late.md'),content:'late'}}]};}),executeTool:async()=>{writes++;return{success:true};}},options());
  await entered.promise;engine.shutdown();gate.resolve();assert.equal((await running).decision,'aborted');await engine.drain();assert.equal(writes,0);assert.equal(await storage.readDreamLastConsolidatedAt(),0);
});
test('Dream abort reaches lock acquisition before any late PID commit',async t=>{
  const storage=await temporaryStorage(t),entered=deferred(),release=deferred();let requests=0,capturedSignal;
  const guarded={...storage,async acquireDreamLock(input){capturedSignal=input.signal;entered.resolve();await release.promise;return storage.acquireDreamLock(input);}};
  const dream=createMemoryDream({storage:guarded});const running=dream.run({...snapshot('dream'),memoryRoot:storage.rootDir,model:model(async()=>{requests++;return{text:'done'};}),executeTool:storageExecutor(storage)},options());
  await entered.promise;dream.shutdown();release.resolve();assert.equal((await running).decision,'aborted');assert.equal(capturedSignal.aborted,true);assert.equal(requests,0);assert.equal(await storage.readDreamLastConsolidatedAt(),0);
});
test('Dream touched paths support narrow shell rm and host virtual removal without double counting',()=>{
  const paths=new Set();const input={rootDir:memoryRoot,workingDirectory:workspace,workspaceRoot:workspace,tools};const file=join(memoryRoot,'old.md');
  collectDreamTouchedPaths(paths,{...input,toolCall:{name:'Bash',input:{command:`rm -f '${file}'`}}});
  collectDreamTouchedPaths(paths,{...input,toolCall:{name:'Write',input:{file_path:file}}});
  collectDreamTouchedPaths(paths,{...input,tools:[{name:'pwsh',semanticName:'Bash'}],toolCall:{name:'pwsh',input:{command:'Remove-Item'}},collectShellRemovalPaths:()=>[file,join(memoryRoot,'other.md')]});
  assert.equal(paths.size,2);
});
