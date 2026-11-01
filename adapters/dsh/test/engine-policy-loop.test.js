/** SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode tests/memory-agent-loop.test.ts. Modified for node:test and host wire-name seam.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { evaluateMemoryAgentToolPolicy, runMemoryAgentLoop, captureMemorySnapshot } from '../src/engine/index.js';
import { memoryRoot, workspace, tools, model, deferred, temporaryStorage, storageExecutor } from './engine-helpers.js';
const decide=(name,input,extra={})=>evaluateMemoryAgentToolPolicy({rootDir:memoryRoot,workingDirectory:workspace,workspaceRoot:workspace,tools,toolCall:{id:'call',name,input},...extra});
const base={rootDir:memoryRoot,workingDirectory:workspace,workspaceRoot:workspace,maxTurns:5,request:{messages:[{role:'system',content:'Main context'}],tools,toolSearchEnabled:false}};

test('source shell policy permits safe env/input redirects/devnull but denies writes/wrappers/recursive/glob rm',()=>{
  for(const command of ['head -n 5 /workspace/file','LANG=C head /workspace/file','head < /workspace/file','head /workspace/file > /dev/null',`rm -f '${join(memoryRoot,'old.md')}'`,`rm -f '${join(memoryRoot,'.git','old.md')}'`]) assert.equal(decide('Bash',{command}).allowed,true,command);
  for(const command of ['touch /workspace/file','head /workspace/file > /workspace/copy','PATH=/tmp head /workspace/file','head /workspace/file &',`rm -rf '${join(memoryRoot,'old.md')}'`,`rm '${join(memoryRoot,'*.md')}'`,`rm '${join(memoryRoot,'old.txt')}'`,'rm ../old.md','echo $(touch /tmp/oops)','find . -exec rm {} \\;']) assert.equal(decide('Bash',{command}).allowed,false,command);
});
test('policy allows only registered explicit read tools and contained safe lowercase markdown',()=>{
  for(const name of ['Read','Grep','Glob']) assert.equal(decide(name,{}).allowed,true);
  for(const name of ['Agent','WebFetch','OtherReadOnly','mcp__server__lookup','NoTool']) assert.equal(decide(name,{}).allowed,false);
  for(const file of ['fact.md','Title.md','nested/fact.md','MEMORY.md','.git-notes/fact.md']) assert.equal(decide('Write',{file_path:join(memoryRoot,file)}).allowed,true,file);
  for(const file of ['fact.MD','../outside.md','.git/fact.md','hooks/fact.md','.GIT/fact.md','.git./fact.md','.g\u200cit/fact.md','node_modules/fact.md']) assert.equal(decide('Write',{file_path:join(memoryRoot,file)}).allowed,false,file);
});
test('original DSH wire names are retained, semantic names only influence policy',async()=>{
  const hostTools=[{name:'write',semanticName:'Write',parameters:{type:'object'},inputSchema:{type:'object'}}];let seen;let count=0;
  const result=await runMemoryAgentLoop({...base,request:{...base.request,tools:hostTools},model:model(async request=>{assert.equal(request.tools,hostTools);return ++count===1?{text:'',toolCalls:[{id:'id',name:'write',input:{file_path:join(memoryRoot,'a.md'),content:'yes'}}]}:{text:'done'};}),executeTool:async(call)=>{seen=call;return{success:true,output:'done'};}});
  assert.equal(seen.name,'write');assert.equal(result.messages.find(message=>message.role==='tool').toolName,'write');
});
test('canonical assistant response preserves replay metadata and block ordering while calls still execute',async()=>{
  const canonical={id:'native-message',role:'assistant',source:{kind:'model',provider:'provider',model:'thinking-model',replayState:{response:{opaque:'response-id'},blocks:[{signature:'first'},{signature:'second'},{signature:'third'}]}},content:[{type:'text',text:'prefix'},{type:'reasoning',text:'reasoning'},{type:'tool-call',id:'native-call',name:'Read',arguments:'{}'}]};
  let count=0,executed=0;const requests=[];
  const result=await runMemoryAgentLoop({...base,model:model(async request=>{requests.push(request);return ++count===1?{text:'prefix',reasoning:[{type:'reasoning',text:'reasoning'}],toolCalls:[{id:'native-call',name:'Read',input:{}}],assistantMessage:canonical}:{text:'done'};}),executeTool:async call=>{assert.equal(call.id,'native-call');executed++;return{success:true,output:'read result'};}});
  const replay=requests[1].messages.find(message=>message.id==='native-message');assert.deepEqual(replay,canonical);assert.equal(executed,1);assert.equal(result.messages.filter(message=>message.role==='tool').length,1);
  assert.notEqual(replay,canonical);assert.notEqual(replay.source.replayState,canonical.source.replayState);
});
test('snapshot retains all real tool contract fields except the source-excluded ToolSearch entry',()=>{
  const schema={type:'object',properties:{file_path:{type:'string'},custom:{enum:['one','two']}},required:['file_path'],additionalProperties:false};
  const catalog=[{name:'read',semanticName:'Read',description:'actual host description',parameters:schema,inputSchema:schema,deferLoading:true,providerOptions:{strict:true}},{name:'ToolSearch',parameters:{}},{name:'network',sideEffectScope:'network',parameters:{type:'object'}}];
  const frozen=captureMemorySnapshot({tools:catalog,messages:[],durableMessages:[]});assert.equal(frozen.tools.length,2);assert.deepEqual(frozen.tools[0],catalog[0]);assert.deepEqual(frozen.tools[1],catalog[2]);
  schema.properties.custom.enum.push('mutated');assert.deepEqual(frozen.tools[0].parameters.properties.custom.enum,['one','two']);
});
test('PowerShell never goes through Bash parsing and only explicit host decisions permit it',()=>{
  const extra={tools:[{name:'pwsh',semanticName:'Bash',shell:'powershell'}]};
  assert.equal(decide('pwsh',{command:'head /safe'},extra).allowed,false);
  assert.equal(decide('pwsh',{command:'Get-Content -LiteralPath safe'},{...extra,isReadOnlyShell:()=>true}).allowed,true);
  assert.equal(decide('pwsh',{command:'Remove-Item -LiteralPath safe.md'},{...extra,isContainedShellRemoval:()=>true}).allowed,true);
});
test('five and fifty request budgets both execute final tool calls and retain real catalog/schema/context',async()=>{
  for(const budget of [5,50]) {
    let requests=0,executions=0;const initial=structuredClone(base.request.messages);
    const result=await runMemoryAgentLoop({...base,maxTurns:budget,model:model(async request=>{
      requests++;assert.equal(request.tools,tools);assert.equal(request.options.maxOutputTokens,5000);assert.equal(request.options.reasoningLevel,'low');assert.equal(request.messages[0].content,'Main context');
      return {text:`turn ${requests}`,toolCalls:[{id:`id-${requests}`,name:requests===budget?'Write':'Read',input:{file_path:join(memoryRoot,'a.md'),content:'fact'}}]};
    }),executeTool:async()=>{executions++;return{success:true,output:'result'};}});
    assert.equal(requests,budget);assert.equal(executions,budget);assert.equal(result.turns,budget);assert.equal(result.messages.at(-1).toolCallId,`id-${budget}`);assert.deepEqual(base.request.messages,initial);
  }
});
test('missing tool and policy rejection close the original call ids without executor invocation',async()=>{
  let executions=0,count=0;
  const result=await runMemoryAgentLoop({...base,model:model(async()=>++count===1?{text:'',toolCalls:[{id:'missing',name:'Unknown',input:{}},{id:'blocked',name:'Agent',input:{}}]}:{text:'done'}),executeTool:async()=>{executions++;}});
  assert.equal(executions,0);const results=result.messages.filter(message=>message.role==='tool');
  assert.deepEqual(results.map(message=>message.toolCallId),['missing','blocked']);assert.match(results[0].content,/No such tool available: Unknown/);assert.equal(results.every(message=>message.isError),true);
});
test('media projection occurs on every request including media produced by tools',async()=>{
  let requests=0,projections=0;
  const result=await runMemoryAgentLoop({...base,projectMessages:messages=>{projections++;return messages.map(message=>Array.isArray(message.content)?{...message,content:message.content.filter(block=>block.type!=='video')}:message);},model:model(async request=>{requests++;assert.equal(request.messages.flatMap(message=>message.content).some(block=>block?.type==='video'),false);return requests===1?{text:'',reasoning:[{type:'reasoning',text:'reason',providerOptions:{id:'provider'}}],toolCalls:[{id:'r',name:'Read',input:{}}]}:{text:'done'};}),executeTool:async()=>({success:true,modelContent:[{type:'video',dataUrl:'video'}, {type:'text',text:'result'}]})});
  assert.equal(projections,2);assert.equal(result.messages.find(message=>message.role==='assistant').content[0].providerOptions.id,'provider');
});
test('abort after executor result prevents all subsequent model requests',async()=>{
  const controller=new AbortController();let requests=0;
  await assert.rejects(runMemoryAgentLoop({...base,abortSignal:controller.signal,model:model(async()=>{requests++;return{text:'',toolCalls:[{id:'r',name:'Read',input:{}}]};}),executeTool:async()=>{controller.abort();return{success:true,output:'late'};}}),{name:'AbortError'});
  assert.equal(requests,1);
});
test('parallel calls execute as a complete batch and Edit requires inherited or completed Read',async t=>{
  const storage=await temporaryStorage(t);const file=join(storage.rootDir,'fact.md');await storage.write(file,'original');
  let count=0;const requests=[];
  const result=await runMemoryAgentLoop({...base,rootDir:storage.rootDir,request:{...base.request},model:model(async request=>{requests.push(request);return ++count===1?{text:'',toolCalls:[{id:'no-read',name:'Edit',input:{file_path:file,old_string:'original',new_string:'bad'}}]}:count===2?{text:'',toolCalls:[{id:'read',name:'Read',input:{file_path:file}}]}:count===3?{text:'',toolCalls:[{id:'edit',name:'Edit',input:{file_path:file,old_string:'original',new_string:'changed'}}]}:{text:'done'};}),executeTool:storageExecutor(storage)});
  assert.equal(result.messages.find(message=>message.toolCallId==='no-read').isError,true);assert.equal((await storage.read(file)).content,'changed');
  const seed=new Map();await storage.read(file,{readState:seed});
  await runMemoryAgentLoop({...base,rootDir:storage.rootDir,maxTurns:1,readState:seed,model:model(async()=>({text:'',toolCalls:[{id:'seeded',name:'Edit',input:{file_path:file,old_string:'changed',new_string:'inherited'}}]})),executeTool:storageExecutor(storage)});
  assert.equal((await storage.read(file)).content,'inherited');assert.equal(seed.get(file)?.content ?? [...seed.values()][0].content,'changed');
});
