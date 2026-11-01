import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMemoryRequest,installMemoryRoutes} from '../src/dsh/routes.js';
const request=(path,options)=>new Request('http://localhost/api/zcode-memory/'+path,options);
function controller(values={}){let enabled=false;return {getSettings:()=>({enabled,local:true,sessionScoped:true,branch:'default-index'}),setEnabled:async value=>{enabled=value;return {enabled,local:true,sessionScoped:true,branch:'default-index'};},catalog:{listWorkspaces:async()=>[],readFile:async()=>({content:'safe',updatedAt:1})},...values};}
test('routes are exact registrations on authenticated DSH connection, no independent web route',()=>{
 const routes=[];installMemoryRoutes({connection:{fetch:{register:r=>routes.push(r)}}},controller());
 assert.deepEqual(routes.map(r=>r.path),['/api/zcode-memory/settings','/api/zcode-memory/workspaces','/api/zcode-memory/file']);
 assert.ok(routes.every(r=>r.requestBody==='buffered'));
});
test('disabled and remote handlers never read memory catalog',async()=>{
 let reads=0;const catalog={listWorkspaces:async()=>{reads++;return [];}};
 for(const settings of [{enabled:false,local:true},{enabled:true,local:false}]){
  const response=await handleMemoryRequest(request('workspaces'),controller({catalog,getSettings:()=>settings}));assert.equal(response.status,403);
 }assert.equal(reads,0);
});
test('settings commits exact boolean and rejects malformed or oversized payloads',async()=>{
 const c=controller();let res=await handleMemoryRequest(request('settings',{method:'POST',headers:{'content-type':'application/json'},body:'{"enabled":true}'}),c);
 assert.equal(res.status,200);assert.equal((await res.json()).enabled,true);
 for(const body of ['{"enabled":"yes"}','{"enabled":true,"path":"outside"}',JSON.stringify({enabled:true,padding:'x'.repeat(2048)})]){res=await handleMemoryRequest(request('settings',{method:'POST',headers:{'content-type':'application/json'},body}),c);assert.equal(res.status,400);}
});
test('catalog strips private paths and errors never leak host paths',async()=>{
 const c=controller({getSettings:()=>({enabled:true,local:true}),catalog:{listWorkspaces:async()=>[{id:'id',label:'label',updatedAt:3,path:'secret',files:[{name:'one.md',kind:'item',size:2,updatedAt:3,path:'secret'}]}],readFile:async()=>{throw Object.assign(new Error('C:/private/key'),{code:'FILE_TOO_LARGE'});}}});
 const res=await handleMemoryRequest(request('workspaces'),c);assert.equal((await res.text()).includes('secret'),false);
 const error=await handleMemoryRequest(request('file?workspaceId=x&fileName=y'),c);assert.equal(error.status,413);assert.equal((await error.text()).includes('private'),false);
});
