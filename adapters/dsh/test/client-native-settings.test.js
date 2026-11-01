import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeMemoryApi } from '../src/client/native-settings.js';
import { fakeNativeSettings } from './helpers/native-settings.js';
function make(options, environment={}) {const fixture=fakeNativeSettings(options);return {...fixture,api:createNativeMemoryApi({isLoopback:true},fixture.configForms,environment)};}

test('native form reads accepted settings and writes only the enabled field without private settings HTTP',async()=>{
  const f=make({}, {location:{protocol:'https:'},fetch:()=>assert.fail('Settings must use native ConfigForms, not fetch')});
  assert.deepEqual(await f.api.getSettings(),{enabled:false,local:true,sessionScoped:true,branch:'default-index',writable:true});
  assert.deepEqual(await f.api.setSettings({enabled:true}),{enabled:true,local:true,sessionScoped:true,branch:'default-index',writable:true});
  assert.deepEqual(f.calls,['describe',['set','enabled',true]]);
  assert.equal(f.form.getSnapshot().revision,2);
});
test('namespace absence and describe failures are distinct from enabled=false',async()=>{
  for(const [options,code] of [[{status:'unavailable'},'SETTINGS_UNAVAILABLE'],[{status:'loading'},'SETTINGS_UNAVAILABLE'],[{readError:'controlled read error'},'SETTINGS_READ_FAILED']])await assert.rejects(make(options).api.getSettings(),error=>error.code===code);
});
test('native read-only and rejected writes retain the accepted state',async()=>{
  const readonly=make({writable:false});assert.equal((await readonly.api.getSettings()).writable,false);
  await assert.rejects(readonly.api.setSettings({enabled:true}),error=>error.code==='SETTINGS_READ_ONLY');
  assert.deepEqual(readonly.calls,['describe']);
  const rejected=make({accepted:false});await assert.rejects(rejected.api.setSettings({enabled:true}),error=>error.code==='SETTINGS_WRITE_FAILED');
  assert.equal(rejected.form.getSnapshot().value.enabled,false);
});
test('cancelled page wait never disposes the shared native form',async()=>{
  const f=make();let finish;f.mirror.load=()=>new Promise(resolve=>finish=resolve);
  const abort=new AbortController();const result=f.api.getSettings(abort.signal);abort.abort();
  await assert.rejects(result,error=>error.name==='AbortError');finish();
  assert.equal(f.form.getSnapshot().status,'ready');
  await assert.rejects(f.api.setSettings({enabled:true},abort.signal),error=>error.name==='AbortError');
  assert.equal(f.calls.length,0);
});
test('catalog and file preview still use the authorized host carrier and retain local-only guard',async()=>{
  const requests=[];const f=make({enabled:true},{__DSH_TRANSPORT__:{fetch:async(path)=>{
    requests.push(path);return new Response(JSON.stringify(path.endsWith('workspaces')?{workspaces:[]}:{content:'# saved memory',updatedAt:1}));
  }}});
  await f.api.getWorkspaces();await f.api.getFile('workspace','MEMORY.md');
  assert.deepEqual(requests,['api/zcode-memory/workspaces','api/zcode-memory/file?workspaceId=workspace&fileName=MEMORY.md']);
  const remote=createNativeMemoryApi({isLoopback:false},f.configForms,{});
  assert.equal((await remote.getSettings()).local,false);
  assert.throws(()=>remote.getWorkspaces(),error=>error.code==='LOCAL_ONLY');
});
test('invalid setting types never reach native mutation',async()=>{
  const f=make();await assert.rejects(f.api.setSettings({enabled:'true'}),TypeError);assert.deepEqual(f.calls,[]);
});
