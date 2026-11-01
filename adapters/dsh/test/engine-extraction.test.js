/** SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode tests/memory-extraction.test.ts and runtime-memory-extraction.test.ts.
 * Modifications: node:test, normalized histories, explicit cancellation and snapshot assertions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createMemoryExtractionScheduler, evaluateMemoryExtraction, createMemoryEngine } from '../src/engine/index.js';
import { deferred, snapshot, user, memoryRoot, model, temporaryStorage, storageExecutor } from './engine-helpers.js';

 test('extraction keeps exact whitespace gate including Chinese limitation and metadata exclusions',()=>{
  assert.equal(evaluateMemoryExtraction(snapshot('1',[user('1','请记住我更喜欢中文')])).reason,'no-user-prose');
  assert.equal(evaluateMemoryExtraction(snapshot('1',[user('1','请 记住 中文')])).decision,'run');
  assert.equal(evaluateMemoryExtraction(snapshot('1',[user('1','just two')])).decision,'skip');
  for(const change of [{synthetic:true},{visibility:'model-only'}]) {
    assert.equal(evaluateMemoryExtraction(snapshot('1',[{...user('1'),...change}])).decision,'skip');
  }
  for(const change of [{synthetic:true},{ignored:true}]) {
    const message=user('1');Object.assign(message.parts[0],change);
    assert.equal(evaluateMemoryExtraction(snapshot('1',[message])).decision,'skip');
  }
 });
test('direct mutation attempt skips even when tool failed; missing cursor deliberately falls back differently',()=>{
  const write={id:'2',role:'assistant',parts:[{type:'tool',tool:'Write',state:{status:'error',input:{file_path:join(memoryRoot,'a.md')}}}]};
  const input=snapshot('2',[user('1'),write]);
  assert.equal(evaluateMemoryExtraction(input).reason,'direct-memory-write');
  assert.deepEqual(evaluateMemoryExtraction(input,'missing'),{decision:'run',messageCount:2});
  assert.deepEqual(evaluateMemoryExtraction(input,'2'),{decision:'skip',reason:'no-user-prose',messageCount:0});
});
test('scheduler has one running and latest pending; cursor drives incremental messageCount',async()=>{
  const entered=deferred(),release=deferred();const calls=[];
  const scheduler=createMemoryExtractionScheduler(async({snapshot:input,messageCount})=>{calls.push([input.boundaryMessageId,messageCount]);if(calls.length===1){entered.resolve();await release.promise;}return 'success';});
  scheduler.schedule(snapshot('1'));await entered.promise;
  scheduler.schedule(snapshot('2',[user('1'),user('2')]));
  scheduler.schedule(snapshot('3',[user('1'),user('2'),user('3')]));
  assert.equal(scheduler.hasPendingWork(),true);release.resolve();await scheduler.drain();
  assert.deepEqual(calls,[['1',1],['3',2]]);assert.equal(scheduler.getCursor(),'3');assert.equal(scheduler.hasPendingWork(),false);
});
test('scheduler snapshots mutable nested history/tool input/read-state immediately',async()=>{
  const entered=deferred(),release=deferred();let captured;
  const scheduler=createMemoryExtractionScheduler(async input=>{entered.resolve();await release.promise;captured=input.snapshot;return 'success';});
  const input=snapshot('1');input.readState.set('a',{path:'a',content:'original'});scheduler.schedule(input);
  input.durableMessages[0].parts[0].text='changed';input.messages[0].content='changed';input.readState.get('a').content='changed';
  await entered.promise;release.resolve();await scheduler.drain();
  assert.equal(captured.durableMessages[0].parts[0].text,'Please remember this preference');assert.equal(captured.messages[0].content,'Full main context');assert.equal(captured.readState.get('a').content,'original');
});
test('failure/abort do not advance cursor; no-op and skipped snapshots do',async()=>{
  let status='error';let count=0;
  const scheduler=createMemoryExtractionScheduler(async()=>{count++;return status;});
  scheduler.schedule(snapshot('1'));await scheduler.drain();assert.equal(scheduler.getCursor(),undefined);
  status='aborted';scheduler.schedule(snapshot('2'));await scheduler.drain();assert.equal(scheduler.getCursor(),undefined);
  status='no-op';scheduler.schedule(snapshot('3'));await scheduler.drain();assert.equal(scheduler.getCursor(),'3');
  scheduler.schedule(snapshot('4',[user('4','ok')]));await scheduler.drain();assert.equal(scheduler.getCursor(),'4');assert.equal(count,3);
});
test('shutdown abandons unresolved acquisition and drops pending work',async()=>{
  let calls=0;const wait=deferred();const scheduler=createMemoryExtractionScheduler(async()=>{calls++;return 'success';});
  scheduler.schedule(wait.promise);scheduler.schedule(snapshot('next'));scheduler.shutdown();await scheduler.drain();wait.resolve(snapshot('late'));await Promise.resolve();
  assert.equal(calls,0);assert.equal(scheduler.getCursor(),undefined);assert.equal(scheduler.hasPendingWork(),false);
});
test('rejected acquisition is observed and does not prevent the newest queued extraction',async()=>{
  const errors=[],first=deferred(),seen=[];
  const scheduler=createMemoryExtractionScheduler(async({snapshot})=>{seen.push(snapshot.boundaryMessageId);return 'success';},{onError:error=>errors.push(error.message)});
  scheduler.schedule(first.promise);scheduler.schedule(snapshot('2'));first.reject(new Error('broken acquisition'));await scheduler.drain();
  assert.deepEqual(errors,['broken acquisition']);assert.deepEqual(seen,['2']);
});
test('engine does real multi-turn Write/Read/Edit with independent state, denied path and preserved origin',async t=>{
  const storage=await temporaryStorage(t);const mainRead=new Map();const file=join(storage.rootDir,'preference.md');let requestCount=0;const requests=[];
  const selected=model(async request=>{requests.push(request);requestCount++;
    if(requestCount===1)return {text:'save',toolCalls:[{id:'write',name:'Write',input:{file_path:file,content:'---\nname: preference\ndescription: User preference\nmetadata:\n  type: feedback\n---\nUse brief replies.'}},{id:'escape',name:'Write',input:{file_path:join(storage.rootDir,'..','escape.md'),content:'no'}}]};
    if(requestCount===2)return {text:'read',toolCalls:[{id:'read',name:'Read',input:{file_path:file}}]};
    if(requestCount===3)return {text:'edit',toolCalls:[{id:'edit',name:'Edit',input:{file_path:file,old_string:'brief replies',new_string:'concise replies'}}]};
    return {text:'Nothing to save.'};
  });
  const engine=createMemoryEngine({storage,readState:mainRead});engine.schedule({...snapshot('last'),memoryRoot:storage.rootDir,model:selected,executeTool:storageExecutor(storage)});await engine.drain();
  const saved=await storage.read(file);assert.match(saved.content,/concise replies/);assert.match(saved.content,/originSessionId: engine-session/);assert.equal(engine.getCursor(),'last');assert.equal(mainRead.size,0);assert.equal(requestCount,4);
  assert.equal(requests[1].messages.find(message=>message.toolCallId==='escape').isError,true);
  assert.match(requests[0].messages.at(-1).content,/memory extraction subagent/);
});
test('late provider response after shutdown cannot write, make another request or advance cursor',async t=>{
  const storage=await temporaryStorage(t);const entered=deferred(),release=deferred();let calls=0,writes=0;
  const engine=createMemoryEngine({storage});
  engine.schedule({...snapshot('1'),memoryRoot:storage.rootDir,model:model(async()=>{calls++;entered.resolve();await release.promise;return {text:'',toolCalls:[{id:'late',name:'Write',input:{file_path:join(storage.rootDir,'late.md'),content:'late'}}]};}),executeTool:async()=>{writes++;return {success:true};}});
  await entered.promise;engine.schedule(snapshot('2'));engine.shutdown();release.resolve();await engine.drain();
  assert.equal(calls,1);assert.equal(writes,0);assert.equal(engine.getCursor(),undefined);assert.deepEqual(await storage.manifest(),[]);
});
test('background failures are reported and cursor remains retryable',async t=>{
  const storage=await temporaryStorage(t),errors=[];const engine=createMemoryEngine({storage,onError:error=>errors.push(error.message)});
  engine.schedule({...snapshot('1'),model:model(async()=>{throw new Error('provider failed');})});await engine.drain();assert.deepEqual(errors,['provider failed']);assert.equal(engine.getCursor(),undefined);
});
