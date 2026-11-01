// Regression: a native DSH transport may expose rpc.call with NO fetch function.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshMemoryApi } from '../src/client/transport.js';
const catalog={workspaces:[{id:'project-1234567890abcdef',label:'project',updatedAt:1,files:[{name:'MEMORY.md',kind:'index',size:6,updatedAt:1}]}]};

test('RPC-only Desktop carrier lists memory and reads files without any Fetch capability',async()=>{
  const calls=[];
  const rpc={async call(channel,endpoint,payload,signal){assert.equal(this,rpc);calls.push({channel,endpoint,payload,signal});return {ok:true,value:endpoint.endsWith('/workspaces')?catalog:{content:'# fact',updatedAt:1}};}};
  const connection={isLoopback:true,rpc};
  const environment={__DSH_TRANSPORT__:{rpc},location:{protocol:'dsh:'},fetch:()=>assert.fail('must not fall back to another host or global fetch')};
  const api=createDshMemoryApi(connection,environment);
  const controller=new AbortController();
  assert.deepEqual(await api.getWorkspaces(controller.signal),catalog);
  assert.deepEqual(await api.getFile('project-1234567890abcdef','MEMORY.md',controller.signal),{content:'# fact',updatedAt:1});
  assert.deepEqual(calls.map(({channel,endpoint,payload})=>({channel,endpoint,payload})),[
    {channel:'/api',endpoint:'zcode-memory/workspaces',payload:{}},
    {channel:'/api',endpoint:'zcode-memory/file',payload:{workspaceId:'project-1234567890abcdef',fileName:'MEMORY.md'}},
  ]);
  assert.ok(calls.every(call=>call.signal===controller.signal));
});

test('RPC rejection never falls back to HTTP or a different principal',async()=>{
  const api=createDshMemoryApi({isLoopback:true,rpc:{call:async()=>({ok:false,error:{code:'LOCAL_ONLY',message:'local only',details:{}}})}},
    {__DSH_TRANSPORT__:{fetch:()=>assert.fail('fallback prohibited')},fetch:()=>assert.fail('fallback prohibited')});
  await assert.rejects(api.getWorkspaces(),error=>error.code==='LOCAL_ONLY');
});
