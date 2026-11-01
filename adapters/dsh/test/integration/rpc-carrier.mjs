// Real installed Connection caller + real shared Host handler, exposed to the plugin as RPC-only.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Context,createHarness,pluginEntry,createVolatile,updateVolatile} from './runtime.mjs';
const {installConnection}=await import('@deepseek-ai/dsh-client-connection/client');
const {createDshMemoryApi}=await import(new URL('./client/transport.js',pluginEntry));
async function caller(host,peer){
  const ctx=new Context();const requests=[];const shared=host.createSharedFetchHandler('/api');
  installConnection(ctx,{transport:{ownsHost:true,fetch:(url,init)=>{
    requests.push({url,method:init.method});
    return shared.fetch(new Request(new URL(url,'http://integration.invalid/'),init),peer);
  }}});
  const api=createDshMemoryApi(ctx.connection,{__DSH_TRANSPORT__:{rpc:ctx.connection.rpc},fetch:()=>assert.fail('A logical RPC-only carrier must never use global Fetch')});
  return {ctx,api,requests};
}

test('real DSH RPC-only caller lists and reads memory through owner-protected shared routes',async()=>{
  const h=await createHarness();let client,owner;
  try{
    const connection=await h.connection();const {controller,config,unload}=await h.memory({enabled:true,extractionEnabled:false});
    const agent=await h.agent();const root=controller.inspect(agent.id).rootDir;
    await writeFile(path.join(root,'MEMORY.md'),'- [RPC fixture](rpc.md) — retained data\n');
    owner=connection.createPeer({principal:{kind:'owner'},interactions:'none'});
    client=await caller(connection,owner);
    const {workspaces}=await client.api.getWorkspaces();
    const workspace=workspaces.find(w=>w.id===path.basename(path.dirname(root)));assert.ok(workspace);
    assert.match((await client.api.getFile(workspace.id,'MEMORY.md')).content,/RPC fixture/);
    assert.ok(client.requests.every(r=>r.method==='POST'));
    await assert.rejects(client.api.getFile(workspace.id,'../outside.md'),error=>error.code==='INVALID_PATH');
    updateVolatile(config.enabled,createVolatile(false));
    await assert.rejects(client.api.getWorkspaces(),error=>error.code==='MEMORY_DISABLED');
    await unload();await assert.rejects(client.api.getWorkspaces(),/HTTP 404/);
  }finally{await client?.ctx.fiber.dispose();await owner?.dispose();await h.close();}
});

test('real RPC-only memory access rejects non-owner peers before handler work',async()=>{
  const h=await createHarness();let client,guest;
  try{
    const connection=await h.connection();await h.memory({enabled:true,extractionEnabled:false});
    guest=connection.createPeer({principal:{kind:'integration-guest',id:'untrusted'},interactions:'none'});
    client=await caller(connection,guest);
    await assert.rejects(client.api.getWorkspaces(),/HTTP 403/);
  }finally{await client?.ctx.fiber.dispose();await guest?.dispose();await h.close();}
});
