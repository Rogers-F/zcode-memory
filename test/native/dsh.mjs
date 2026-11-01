import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHarness,isAgentLoopRequest} from '../../adapters/dsh/test/integration/runtime.mjs';
test('installed DSH: native Cordis disable/re-enable/replacement removes effects and retains facts/settings',async()=>{
 const h=await createHarness();try{
  let loaded=await h.memory({enabled:true,extractionEnabled:false}),a=await h.agent();const root=loaded.controller.inspect(a.id).rootDir;
  const {default:core}=await import('../../adapters/dsh/shared.cjs'),store=new core.MemoryStore({root,host:'dsh',project:h.workspace});await store.save({path:'lifecycle.md',body:'项目发布先 staging'});await store.configure({autoExtract:false,recall:{maxChars:3456}});
  assert.ok(h.ctx.tools.schemas().some(t=>t.name==='memory_save'));h.model.respond=()=>({text:'启用时正常回答'});await h.turn(a,'项目发布流程');assert.match(JSON.stringify(h.model.requests.filter(isAgentLoopRequest).at(-1).messages),/lifecycle.md/);const config={enabled:true,extractionEnabled:false,semanticRecallEnabled:false};await loaded.unload();assert.equal(h.ctx.tools.schemas().some(t=>t.name==='memory_save'),false);
  h.model.respond=()=>({text:'禁用时正常回答'});const requestCount=h.model.requests.length;await h.turn(a,'禁用后的新请求：项目发布流程');assert.ok(h.model.requests.length>requestCount,JSON.stringify(a.session.log.slice(-12)));assert.doesNotMatch(JSON.stringify(h.model.requests.at(-1).messages),/zcode-memory-background|lifecycle.md/);
  for(const action of ['enable','update']){loaded=await h.memory(config);assert.ok(h.ctx.tools.schemas().some(t=>t.name==='memory_save'),action);const session=await h.agent();await h.turn(session,'项目发布流程');assert.match(JSON.stringify(h.model.requests.filter(isAgentLoopRequest).at(-1).messages),/lifecycle.md/);assert.equal(loaded.controller.getSettings().extractionEnabled,false);assert.equal((await store.catalog()).settings.recall.maxChars,3456);await loaded.unload();assert.equal(h.ctx.tools.schemas().some(t=>t.name==='memory_save'),false);}
  assert.match((await store.read('lifecycle.md')).body,/staging/,'remove retains separate storage');
 }finally{await h.close();}
});
test('installed DSH: read-only policy rejects the new native memory_save tool',async()=>{
  const h=await createHarness({sandboxMode:'read-only'});try{
    const {controller}=await h.memory({enabled:true});const a=await h.agent();let first=true;
    h.model.respond=()=>first?(first=false,{calls:[{id:'denied-unified',name:'memory_save',arguments:{path:'denied-unified.md',body:'不得写入的事实'}}]}):({text:'拒绝写入'});
    await h.turn(a,'请保存事实');
    assert.ok(a.session.log.some(e=>e.type==='tool/result'&&JSON.stringify(e).includes('read-only')));
    await assert.rejects(readFile(path.join(controller.inspect(a.id).rootDir,'denied-unified.md')),{code:'ENOENT'});
  }finally{await h.close();}
});
test('installed DSH: memory enabled still requires separate extraction opt-in',async()=>{
  const h=await createHarness();try{
    const {controller}=await h.memory({enabled:true});const a=await h.agent();
    await h.turn(a,'记住：以后请用中文回答');await controller.drain();
    assert.equal(h.model.requests.length,1);
  }finally{await h.close();}
});
test('installed DSH: unified tools use the real registry, read MEMORY.md, recall, inject and forget',async()=>{
  const h=await createHarness();try{
    const {controller}=await h.memory({enabled:true,extractionEnabled:false});const a=await h.agent();let first=true;
    h.model.respond=()=>first?(first=false,{calls:[{id:'native-save',name:'memory_save',arguments:{path:'native.md',body:'以后项目发布先经过 staging 再审批',type:'project'}}]}):({text:'保存完成'});
    await h.turn(a,'请保存发布约定');
    assert.ok(a.session.log.some(e=>e.type==='tool/result'&&JSON.stringify(e).includes('saved')),JSON.stringify(a.session.log));
    const b=await h.agent();first=true;
    h.model.respond=()=>first?(first=false,{calls:[{id:'native-read',name:'memory_read',arguments:{path:'MEMORY.md'}},{id:'native-recall',name:'memory_recall',arguments:{query:'发布'}}]}):({text:'读取完成'});
    await h.turn(b,'请召回发布约定');
    assert.ok(b.session.log.some(e=>e.type==='tool/result'&&JSON.stringify(e).includes('staging')));
    assert.ok(h.model.requests.filter(isAgentLoopRequest).some(r=>JSON.stringify(r.messages).includes('native.md')));
    first=true;h.model.respond=()=>first?(first=false,{calls:[{id:'native-forget',name:'memory_forget',arguments:{path:'native.md'}}]}):({text:'已遗忘'});
    await h.turn(b,'请遗忘这个发布约定');await controller.drain();
    await assert.rejects(readFile(path.join(controller.inspect(b.id).rootDir,'native.md')),{code:'ENOENT'});
  }finally{await h.close();}
});
test('installed DSH: direct plugin activation defaults off without auxiliary requests',async()=>{const h=await createHarness();try{const {controller}=await h.memory();const a=await h.agent();await h.turn(a,'记住：以后请使用中文回答');await controller.drain();assert.equal(controller.inspect(a.id).enabled,false);assert.equal(h.model.requests.length,1);}finally{await h.close();}});
test('installed DSH: native tools extract Chinese, shared index persists, new session injects and reads',async()=>{const h=await createHarness();try{const {controller}=await h.memory({enabled:true,extractionEnabled:true});const a=await h.agent();const root=controller.inspect(a.id).rootDir;let background=0;h.model.respond=request=>{if(isAgentLoopRequest(request))return {text:'收到'};return ++background===1?{calls:[{id:'write-memory',name:'write',arguments:{file_path:path.join(root,'chinese.md'),content:'---\nname: 中文偏好\ndescription: 回答语言\nmetadata:\n  type: user\n---\n\n用户偏好中文回答。'}}]}:{text:'保存完成'};};await h.turn(a,'记住：以后请使用中文回答');await controller.drain();assert.ok(background>=2);assert.match(await readFile(path.join(root,'chinese.md'),'utf8'),/host: dsh/);assert.match(await readFile(path.join(root,'MEMORY.md'),'utf8'),/chinese.md/);assert.ok(controller.inspect(a.id).cursor);const b=await h.agent();h.model.respond=()=>({text:'新的会话'});await h.turn(b,'请确认回答语言');await controller.drain();assert.ok(h.model.requests.filter(isAgentLoopRequest).some(r=>JSON.stringify(r.messages).includes('中文偏好')));}finally{await h.close();}});
test('installed DSH: read-only native tool policy refuses fact writes',async()=>{const h=await createHarness({sandboxMode:'read-only'});try{const {controller}=await h.memory({enabled:true,extractionEnabled:false});const a=await h.agent();const root=controller.inspect(a.id).rootDir;let first=true;h.model.respond=()=>first?(first=false,{calls:[{id:'denied',name:'write',arguments:{file_path:path.join(root,'denied.md'),content:'not allowed'}}]}):({text:'拒绝写入'});await h.turn(a,'请记住我的偏好');assert.ok(a.session.log.some(e=>e.type==='tool/result'&&JSON.stringify(e).includes('read-only')));await assert.rejects(readFile(path.join(root,'denied.md')),{code:'ENOENT'});}finally{await h.close();}});
test('installed DSH: semantic host bridge calls once, finds English from Chinese, then forget invalidates the live attachment',async()=>{
 const h=await createHarness();try{
  const {controller}=await h.memory({enabled:true,semanticRecallEnabled:true,extractionEnabled:false});const a=await h.agent();const root=controller.inspect(a.id).rootDir;
  const {default:core}=await import('../../adapters/dsh/shared.cjs');await new core.MemoryStore({root,host:'dsh',project:h.workspace}).save({path:'semantic-release.md',body:'Always run staging before release.'});
  let auxiliary=0;h.model.respond=request=>{if(isAgentLoopRequest(request))return {text:'收到'};auxiliary++;const input=JSON.parse(request.messages.at(-1).content.filter(b=>b.type==='text').map(b=>b.text).join(''));const match=input.candidates.find(c=>c.summary.includes('Always run staging'));return {text:JSON.stringify({version:1,matches:match?[{id:match.id,relevance:0.98,evidence:'Always run staging before release.'}]:[]})};};
  await h.turn(a,'发布前要做什么');assert.equal(auxiliary,1,JSON.stringify(controller.inspect(a.id)));assert.ok(h.model.requests.filter(isAgentLoopRequest).some(r=>JSON.stringify(r.messages).includes('semantic-release.md')));
  await h.turn(a,'发布前要做什么');assert.equal(auxiliary,1,'seen candidate must not cause another completion');
  await new core.MemoryStore({root,host:'dsh',project:h.workspace}).forget('semantic-release.md');await h.turn(a,'发布前要做什么');assert.ok(auxiliary<=2,'changed active pool allows at most one new classification');assert.doesNotMatch(JSON.stringify(h.model.requests.filter(isAgentLoopRequest).at(-1).messages),/semantic-release.md|Always run staging/);
 }finally{await h.close();}
});
test('installed DSH: creating sessions does not rewrite shared settings',async()=>{
 const h=await createHarness();try{const {controller}=await h.memory({enabled:true,extractionEnabled:false});const a=await h.agent(),root=controller.inspect(a.id).rootDir;await assert.rejects(readFile(path.join(root,'.unified/state.json')),{code:'ENOENT'});await h.agent();await assert.rejects(readFile(path.join(root,'.unified/state.json')),{code:'ENOENT'});}finally{await h.close();}
});
test('installed DSH: real pre-step -> tool -> pre-step replays sticky bodies, next turn persists, forget removes immediately',async()=>{
 const h=await createHarness();try{
  const {controller}=await h.memory({enabled:true,semanticRecallEnabled:true,extractionEnabled:false}),a=await h.agent(),root=controller.inspect(a.id).rootDir;
  const {default:core}=await import('../../adapters/dsh/shared.cjs');const store=new core.MemoryStore({root,host:'dsh',project:h.workspace});await store.save({path:'sticky-release.md',description:'release process',body:'Always run staging before release. BODY-ONLY-DSH'});
  let auxiliary=0,foreground=0;h.model.respond=request=>{if(isAgentLoopRequest(request))return ++foreground===1?{calls:[{id:'sticky-stats',name:'memory_stats',arguments:{}}]}:{text:'收到'};auxiliary++;const input=JSON.parse(request.messages.at(-1).content.filter(b=>b.type==='text').map(b=>b.text).join(''));const c=input.candidates.find(c=>c.summary==='release process');return {text:JSON.stringify({version:1,matches:c?[{id:c.id,relevance:0.99,evidence:c.summary}]:[]})};};
  const backgrounds=()=>h.model.requests.filter(isAgentLoopRequest).map(r=>r.messages.filter(m=>JSON.stringify(m).includes('<zcode-memory-background>')).map(m=>JSON.stringify(m)).join('\n'));
  await h.turn(a,'发布前要做什么');assert.equal(foreground,2,'native memory_stats must cause a real second model step');for(const text of backgrounds()){assert.match(text,/sticky-release.md/);assert.match(text,/BODY-ONLY-DSH/);}assert.equal(auxiliary,1);
  await h.turn(a,'发布前要做什么');assert.match(backgrounds().at(-1),/BODY-ONLY-DSH/);assert.equal(auxiliary,1,'same query on another turn reuses the successful selection');
  // Exercise the installed Session event publisher, without a remote summarizer.
  a.session.append('compaction/start',{});a.session.append('compaction/end',{});await h.turn(a,'发布前要做什么');assert.match(backgrounds().at(-1),/BODY-ONLY-DSH/);assert.equal(auxiliary,1,'compaction rebuild can reuse the semantic result for unchanged revisions');
  foreground=0;h.model.respond=request=>isAgentLoopRequest(request)?(++foreground===1?{calls:[{id:'sticky-forget',name:'memory_forget',arguments:{path:'sticky-release.md'}}]}:{text:'已遗忘'}):{text:JSON.stringify({version:1,matches:[]})};
  await h.turn(a,'请遗忘发布约定');assert.equal(foreground,2);assert.doesNotMatch(backgrounds().at(-1),/sticky-release.md|BODY-ONLY-DSH/);await assert.rejects(store.read('sticky-release.md'),{code:'NOT_FOUND'});
  assert.equal(Object.keys((await store.catalog()).checkpoints).filter(k=>k.startsWith('inject:')).length,0);
 }finally{await h.close();}
});
