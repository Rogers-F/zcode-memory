import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMemoryRequest,installMemoryRoutes} from '../src/dsh/routes.js';
function setup(){let enabled=true;const calls=[];return {calls,controller:{getSettings:()=>({enabled,local:true,sessionScoped:true,branch:'default-index'}),setEnabled:async value=>({enabled:enabled=value,local:true,sessionScoped:true,branch:'default-index'}),catalog:{listWorkspaces:async()=>{calls.push('list');return [];},readFile:async(id,name)=>{calls.push([id,name]);return {content:'# saved',updatedAt:1};}}}};}
const rpcRequest=(endpoint,payload={},changes={})=>new Request(`http://integration.invalid/api/zcode-memory/${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'rpc-test-1',method:`zcode-memory/${endpoint}`,payload,...changes})});

test('all memory exact routes accept both legacy HTTP and native RPC POST',()=>{
  const routes=[];installMemoryRoutes({connection:{fetch:{register:route=>routes.push(route)}}},setup().controller);
  assert.equal(routes.length,3);assert.ok(routes.every(r=>r.methods.includes('GET')&&r.methods.includes('POST')));
});
test('RPC envelope echoes correlation and returns validated catalog and unicode file payloads',async()=>{
  const f=setup();const list=await handleMemoryRequest(rpcRequest('workspaces'),f.controller);
  assert.equal(list.status,200);assert.equal(list.headers.get('cache-control'),'no-store');
  assert.deepEqual(await list.json(),{type:'server-response',rpcId:'rpc-test-1',result:{ok:true,value:{workspaces:[]}}});
  const file=await handleMemoryRequest(rpcRequest('file',{workspaceId:'opaque-id',fileName:'偏好.md'}),f.controller);
  assert.deepEqual((await file.json()).result,{ok:true,value:{content:'# saved',updatedAt:1}});
  assert.deepEqual(f.calls,['list',['opaque-id','偏好.md']]);
});
test('owned native carriers may use a non-HTTP Request URL without an origin fallback',async()=>{
  const f=setup();const ordinary=rpcRequest('workspaces');
  const request=new Request('dsh://owned-host/api/zcode-memory/workspaces',{method:'POST',headers:{'content-type':'application/json'},body:await ordinary.text()});
  const response=await handleMemoryRequest(request,f.controller);
  assert.equal((await response.json()).result.ok,true);assert.deepEqual(f.calls,['list']);
});
test('mismatched methods and malformed payloads never reach catalog or file reads',async()=>{
  const f=setup();
  for(const request of [rpcRequest('workspaces',{}, {method:'zcode-memory/file'}),rpcRequest('workspaces',{path:'outside'}),rpcRequest('file',{fileName:'one.md'}),rpcRequest('file',{workspaceId:'id',fileName:'one.md',path:'outside'}),rpcRequest('workspaces',null),rpcRequest('workspaces',{}, {extra:true})]){
    const res=await handleMemoryRequest(request,f.controller);const data=await res.json();assert.equal(data.result.ok,false);assert.equal(data.result.error.code,'INVALID_RPC');
  }
  assert.deepEqual(f.calls,[]);
});
test('RPC preserves storage failure codes but never leaks private failure text',async()=>{
  const f=setup();f.controller.catalog.readFile=async()=>{throw Object.assign(new Error('C:/secret/credential'),{code:'FILE_TOO_LARGE'});};
  const res=await handleMemoryRequest(rpcRequest('file',{workspaceId:'id',fileName:'one.md'}),f.controller);
  const body=await res.json();assert.equal(body.result.ok,false);assert.equal(body.result.error.code,'FILE_TOO_LARGE');assert.equal(body.result.error.details.status,413);assert.equal(JSON.stringify(body).includes('credential'),false);
});
test('RPC settings use the same accepted host value and disabled catalog guard',async()=>{
  const f=setup();let response=await handleMemoryRequest(rpcRequest('settings'),f.controller);assert.equal((await response.json()).result.value.enabled,true);
  response=await handleMemoryRequest(rpcRequest('settings',{enabled:false}),f.controller);assert.equal((await response.json()).result.value.enabled,false);
  response=await handleMemoryRequest(rpcRequest('workspaces'),f.controller);assert.equal((await response.json()).result.error.code,'MEMORY_DISABLED');assert.deepEqual(f.calls,[]);
});
test('invalid correlation ids and oversized envelopes are rejected before any data access',async()=>{
  const f=setup();
  for(const request of [rpcRequest('workspaces',{}, {rpcId:''}),rpcRequest('workspaces',{}, {rpcId:'x'.repeat(129)}),rpcRequest('workspaces',{padding:'x'.repeat(9000)})])assert.equal((await handleMemoryRequest(request,f.controller)).status,400);
  assert.deepEqual(f.calls,[]);
});
