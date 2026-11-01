/** SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode tests/memory-recall.test.ts and runtime-memory-recall.test.ts.
 * Modifications: node:test and real storage Adapter; semantic branch only explicitly exercised in tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  ACTIVE_PROJECT_MEMORY_RETRIEVAL_BRANCH, ENABLE_PROJECT_MEMORY_SEMANTIC_RECALL,
  createMemoryRecallState, canStartMemoryRecall, recordRecalledMemories,
  getMemoryRecallManifest, runMemorySelector, filterMemorySelections,
  findLatestMemoryRecallQuery, isMemoryRecallQueryEligible, createMemoryRecall,
} from '../src/engine/index.js';
import { buildMemorySelectorRequest } from '../src/prompts.js';
import { memoryRoot, model, deferred, temporaryStorage } from './engine-helpers.js';
const manifest=['a.md','b.md','c.md'].map((filename,index)=>({filename,filePath:join(memoryRoot,filename),mtimeMs:index+1,description:`memory ${index}`,type:'feedback'}));
const selected=(...names)=>({text:JSON.stringify({selected_memories:names})});

test('production semantic recall remains fixed off and does not scan or call provider',()=>{
  assert.equal(ENABLE_PROJECT_MEMORY_SEMANTIC_RECALL,false);assert.equal(ACTIVE_PROJECT_MEMORY_RETRIEVAL_BRANCH,'default-index');
  const recall=createMemoryRecall({storage:{manifest(){throw new Error('must not scan');}}});
  assert.equal(recall.start({model:model(()=>{throw new Error('must not call');}),query:'remember my preference'}),false);assert.equal(recall.consume(),undefined);
});
test('query selector uses latest real user, excludes attachments/meta/reminders, and preserves whitespace eligibility',()=>{
  const entries=[{message:{role:'user',content:'actual user question'},metadata:{source:'real_user'}},{kind:'attachment',message:{role:'user',content:'attachment question'}},{message:{role:'user',content:'<system-reminder>not human'}},{message:{role:'user',content:'synthetic content'},metadata:{source:'system'}}];
  assert.equal(findLatestMemoryRecallQuery(entries),'actual user question');
  assert.equal(findLatestMemoryRecallQuery([{message:{role:'user',content:'<system-reminder>literal real user'},metadata:{source:'real_user'}}]),'<system-reminder>literal real user');
  assert.equal(isMemoryRecallQueryEligible('中文没有空格'),false);assert.equal(isMemoryRecallQueryEligible('中文 有空格'),true);assert.equal(isMemoryRecallQueryEligible(' word '),false);
});
test('manifest caches nonempty only and aborted results never stick',async()=>{
  let scans=0;const state=createMemoryRecallState();const storage={manifest:async()=>{scans++;return scans===1?[]:manifest;}};
  assert.deepEqual(await getMemoryRecallManifest({storage,state}),[]);assert.equal(state.manifest,undefined);
  assert.deepEqual(await getMemoryRecallManifest({storage,state}),manifest);await getMemoryRecallManifest({storage,state});assert.equal(scans,2);assert.match(state.selectorMessages[0].content,/Available memories:/);
  const controller=new AbortController();controller.abort();const cancelled=createMemoryRecallState();assert.deepEqual(await getMemoryRecallManifest({storage,state:cancelled,signal:controller.signal}),[]);assert.equal(cancelled.manifest,undefined);
});
test('selector schema, persistent conversation and invalid response behavior match source',async()=>{
  const state={...createMemoryRecallState(),manifest};const request=buildMemorySelectorRequest({state,query:'first question'});
  assert.equal(request.responseJsonSchema.additionalProperties,false);assert.deepEqual(request.responseJsonSchema.required,['selected_memories']);assert.equal(request.messages[0].role,'system');assert.match(request.messages[1].content,/a.md/);
  const valid=await runMemorySelector({state,query:'first question',model:model(async()=>({text:'{"selected_memories":["a.md","a.md"],"selected_knowledge_ids":["k"]}'}))});
  assert.deepEqual(valid,{selectedMemories:['a.md','a.md'],selectedKnowledgeIds:['k']});const previous=structuredClone(state.selectorMessages);
  for(const text of ['not json','[]','{"selected_memories":[1]}','{"selected_memories":[],"extra":true}','{"selected_memories":[],"selected_knowledge_ids":null}']) {
    assert.deepEqual(await runMemorySelector({state,query:'bad question',model:model(async()=>({text}))}),{selectedMemories:[],selectedKnowledgeIds:[]});assert.deepEqual(state.selectorMessages,previous);
  }
  const next=buildMemorySelectorRequest({state,query:'second question'});assert.equal(next.messages.length,5);assert.match(next.messages[2].content,/first question/);
});
test('selector retains filename duplicates and order, filters unknown/already-read/recalled before five limit',()=>{
  const readState=new Map([['read',{path:manifest[1].filePath,content:'read'}]]);
  const entries=filterMemorySelections({manifest,readState,recalledPaths:new Set([manifest[2].filePath]),selectedFilenames:['unknown','b.md','c.md','a.md','a.md','a.md','a.md','a.md','a.md']});
  assert.deepEqual(entries.map(entry=>entry.filename),['a.md','a.md','a.md','a.md','a.md']);
});
test('character budget is a start gate not a hard truncation of a selected batch',()=>{
  const state=createMemoryRecallState();recordRecalledMemories(state,[{filePath:'one',content:'x'.repeat(61439)}]);assert.equal(canStartMemoryRecall(state),true);
  recordRecalledMemories(state,[{filePath:'two',content:'xx'}]);assert.equal(state.recalledContentCharacters,61441);assert.equal(canStartMemoryRecall(state),false);
});
test('prefetch is nonblocking, only consumed once after settlement, syncs revision for later Edit',async t=>{
  const storage=await temporaryStorage(t);const file=join(storage.rootDir,'preference.md');await storage.write(file,'---\ndescription: Style\nmetadata:\n  type: feedback\n---\nPrefer short replies.');
  const readState=new Map();const gate=deferred(),entered=deferred();const recall=createMemoryRecall({storage,readState});
  const started=recall.start({branch:'semantic-recall',query:'What reply style?',model:model(async()=>{entered.resolve();await gate.promise;return selected('preference.md');})});
  assert.equal(started,true);assert.equal(recall.consume({branch:'semantic-recall'}),undefined);await entered.promise;gate.resolve();await recall.drain();
  const attachment=recall.consume({branch:'semantic-recall'});assert.equal(attachment.name,'relevant_memory');assert.match(attachment.content,/Prefer short replies/);assert.equal(readState.size,1);assert.equal(recall.consume({branch:'semantic-recall'}),undefined);
  await storage.edit(file,'short replies','concise replies',{readState});assert.match((await storage.read(file)).content,/concise replies/);
  assert.equal(recall.start({branch:'semantic-recall',query:'another question',model:model(async()=>selected())}),false);
});
test('complete foreground tool batch read-state is rechecked before consuming prefetched body',async t=>{
  const storage=await temporaryStorage(t),readState=new Map();await storage.write('a.md','content');const recall=createMemoryRecall({storage,readState});
  recall.start({branch:'semantic-recall',query:'what content?',model:model(async()=>selected('a.md'))});await recall.drain();
  await storage.read('a.md',{readState});assert.equal(recall.consume({branch:'semantic-recall'}),undefined);assert.equal(recall.getState().recalledPaths.size,0);
});
test('turn abort and reset/compact prevent late selector mutation and stale attachment consumption',async t=>{
  const storage=await temporaryStorage(t);await storage.write('a.md','content');const recall=createMemoryRecall({storage});const gate=deferred(),entered=deferred(),turn=new AbortController();
  recall.start({branch:'semantic-recall',query:'what content?',turnAbortSignal:turn.signal,model:model(async()=>{entered.resolve();await gate.promise;return selected('a.md');})});await entered.promise;
  const before=structuredClone(recall.getState().selectorMessages);turn.abort();gate.resolve();await recall.drain();assert.deepEqual(recall.getState().selectorMessages,before);assert.equal(recall.consume({branch:'semantic-recall'}),undefined);
  recall.reset();assert.equal(recall.getState().manifest,undefined);assert.equal(recall.getState().recalledContentCharacters,0);
});
test('Dream invalidation disposes prefetched body, clears touched read capabilities and sticky metadata',async t=>{
  const storage=await temporaryStorage(t),readState=new Map();const file=join(storage.rootDir,'a.md');await storage.write(file,'content');const recall=createMemoryRecall({storage,readState});
  recall.start({branch:'semantic-recall',query:'what content?',model:model(async()=>selected('a.md'))});await recall.drain();recall.consume({branch:'semantic-recall'});
  assert.equal(readState.size,1);recall.invalidate([file]);assert.equal(readState.size,0);assert.equal(recall.getState().recalledPaths.size,0);assert.equal(recall.getState().manifest,undefined);assert.equal(recall.getState().selectorMessages,undefined);
});
test('safety divergence: truncated recalled body cannot authorize full Write until complete Read',async t=>{
  const storage=await temporaryStorage(t),readState=new Map();const content=Array.from({length:220},(_,i)=>`line ${i}`).join('\n');await storage.write('long.md',content);
  const recall=createMemoryRecall({storage,readState});recall.start({branch:'semantic-recall',query:'what lines?',model:model(async()=>selected('long.md'))});await recall.drain();recall.consume({branch:'semantic-recall'});
  assert.equal([...readState.values()][0].isPartialView,true);
  await assert.rejects(storage.write('long.md','overwrite',{readState}),{code:'READ_REQUIRED'});
  await assert.rejects(storage.edit('long.md','line 219','hidden replacement',{readState}),{code:'READ_REQUIRED'});
  assert.equal((await storage.read('long.md')).content,content);
  await storage.read('long.md',{readState});await storage.write('long.md','complete reread authorized',{readState});
  assert.equal((await storage.read('long.md')).content,'complete reread authorized');
});
test('real recalled body is limited to 200 lines/4096 UTF8 bytes with source stale warning',async t=>{
  const storage=await temporaryStorage(t);await storage.write('lines.md',Array.from({length:220},(_,i)=>`line ${i}`).join('\n'));await storage.write('bytes.md',Array.from({length:30},()=> '汉'.repeat(100)).join('\n'));
  const entries=(await storage.manifest()).map(entry=>({...entry,mtimeMs:1}));const memories=await storage.readRecalledMemories({entries,nowMs:4*86400000});
  const lines=memories.find(memory=>memory.filePath.endsWith('lines.md'));const bytes=memories.find(memory=>memory.filePath.endsWith('bytes.md'));
  assert.match(lines.content,/first 200 lines/);assert.match(lines.header,/3 days old/);assert.match(bytes.content,/4096 byte limit/);assert.equal(bytes.content.includes('�'),false);assert.equal(bytes.limit,13);
});
