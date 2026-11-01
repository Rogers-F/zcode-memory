'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync,spawn}=require('node:child_process');
const {HostMemory}=require('../src/protocol/service.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.work/native/pi');fs.mkdirSync(base,{recursive:true});
const publicNodeRoot=path.join(require('node:os').homedir(),'.local/share/pi-node',`node-${process.version}-${process.platform}-${process.arch}`,'lib/node_modules');
const installed=process.env.PI_CLI_PACKAGE??path.join(publicNodeRoot,'@earendil-works/pi-coding-agent');
const entry=path.join(installed,'dist/bundle/cli.js');if(!fs.existsSync(entry)){console.log('Pi CLI unavailable');process.exit(2);}
const work=fs.mkdtempSync(path.join(base,'run-')),project=path.join(work,'project'),home=path.join(work,'home'),data=path.join(home,'.zcode-memory');
for(const directory of [project,home,path.join(work,'tmp')])fs.mkdirSync(directory,{recursive:true});
const env={PATH:process.env.PATH,HOME:home,USERPROFILE:home,TMPDIR:path.join(work,'tmp'),TMP:path.join(work,'tmp'),TEMP:path.join(work,'tmp'),PI_CODING_AGENT_DIR:path.join(home,'.pi/agent'),CLAUDE_CONFIG_DIR:path.join(home,'.claude'),CODEX_HOME:path.join(home,'.codex'),KIMI_CODE_HOME:path.join(home,'.kimi-code'),JITI_CACHE_DIR:path.join(work,'jiti'),PI_OFFLINE:'1',PI_TELEMETRY:'0',NO_COLOR:'1'};
const adapter=process.env.ZCODE_MEMORY_PI_EXTENSION??(fs.existsSync(path.join(root,'dist/npm/package/adapters/pi-cli/index.ts'))?path.join(root,'dist/npm/package/adapters/pi-cli/index.ts'):path.join(root,'adapters/pi-cli/index.ts'));
const steps=[];
const installs=[];
function install(source){const args=[entry,'install',source],r=spawnSync(process.execPath,args,{cwd:project,env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);installs.push({source,exit:r.status});}
const providerPackage=path.join(work,'scripted-provider');fs.mkdirSync(providerPackage);fs.copyFileSync(path.join(root,'test/fixtures/pi-scripted-provider.ts'),path.join(providerPackage,'provider.ts'));fs.writeFileSync(path.join(providerPackage,'package.json'),JSON.stringify({name:'zcode-memory-test-provider',pi:{extensions:['provider.ts']}}));
install(path.resolve(path.dirname(adapter),'../..'));install(providerPackage);
function run(mode,prompt,mcp=false){
  const capture=path.join(work,mode+'-requests.jsonl');fs.writeFileSync(capture,'');
  const args=[entry,'--offline','--mode','json','--provider','memory-scripted','--model','controlled','--no-session','-p',prompt];
  const r=spawnSync(process.execPath,args,{cwd:project,env:{...env,ZCODE_MEMORY_CAPTURE:capture,ZCODE_MEMORY_SCRIPT_MODE:mode,...(mcp?{ZCODE_MEMORY_PI_MCP:'1'}:{})},encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
  fs.writeFileSync(path.join(work,mode+'-stdout.jsonl'),r.stdout??'');fs.writeFileSync(path.join(work,mode+'-stderr.log'),r.stderr??'');
  assert.equal(r.status,0,`${mode}: ${r.error?.message??r.stderr}`);
  const requests=fs.readFileSync(capture,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  assert.ok(requests.length,`${mode}: scripted provider must actually run`);
  steps.push({mode,requests:requests.length,mcp});return {stdout:r.stdout,requests,stderr:r.stderr};
}
async function stickyRpc(service){
 const mode='sticky-rpc',capture=path.join(work,mode+'-requests.jsonl'),trace=path.join(work,mode+'-events.jsonl');for(const f of [capture,trace])fs.writeFileSync(f,'');
 // Native manual compaction needs an eligible cut point in this tiny synthetic session.
 fs.mkdirSync(env.PI_CODING_AGENT_DIR,{recursive:true});const settingsFile=path.join(env.PI_CODING_AGENT_DIR,'settings.json'),settings=JSON.parse(fs.readFileSync(settingsFile));fs.writeFileSync(settingsFile,JSON.stringify({...settings,compaction:{enabled:false,keepRecentTokens:1,reserveTokens:256}}));
 await service.store().save({path:'sticky-native.md',description:'项目发布流程',body:'项目发布流程先 staging 再审批。BODY-ONLY-NATIVE'});
 const child=spawn(process.execPath,[entry,'--offline','--mode','rpc','--provider','memory-scripted','--model','controlled','--no-session'],{cwd:project,env:{...env,ZCODE_MEMORY_CAPTURE:capture,ZCODE_MEMORY_EVENTS_CAPTURE:trace,ZCODE_MEMORY_SCRIPT_MODE:mode},stdio:['pipe','pipe','pipe']});
 let buffer='',stdout='',stderr='',id=0,settled=0;const pending=new Map(),settleWaiters=new Set();
 child.stderr.on('data',s=>stderr+=s);child.stdout.on('data',s=>{stdout+=s;buffer+=s;while(buffer.includes('\n')){const at=buffer.indexOf('\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+1);let m;try{m=JSON.parse(line);}catch{continue;}if(m.type==='response')pending.get(m.id)?.(m);if(m.type==='agent_settled'){settled++;for(const f of settleWaiters)f();}}});
 const rpc=(type,args={})=>new Promise((resolve,reject)=>{const next=String(++id),timer=setTimeout(()=>{pending.delete(next);reject(Error(`${type} timeout: ${stderr}`));},30000);pending.set(next,m=>{clearTimeout(timer);pending.delete(next);m.success?resolve(m.data):reject(Error(m.error));});child.stdin.write(JSON.stringify({id:next,type,...args})+'\n');});
 const turn=async message=>{const prior=settled;let done;const waiting=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{settleWaiters.delete(done);reject(Error('native Pi settlement timeout'));},30000);done=()=>{if(settled>prior){clearTimeout(timer);settleWaiters.delete(done);resolve();}};settleWaiters.add(done);});await rpc('prompt',{message});await waiting;};
 const requests=()=>fs.readFileSync(capture,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
 const background=r=>r.messages.filter(m=>JSON.stringify(m).includes('<zcode-memory-background>')).map(m=>JSON.stringify(m)).join('\n');
 try{
  await rpc('get_state');await turn('项目发布流程是什么');await turn('项目发布流程是什么');let sent=requests();assert.equal(sent.length,2);for(const r of sent){assert.match(background(r),/sticky-native.md/);assert.match(background(r),/BODY-ONLY-NATIVE/);assert.match(background(r),/index/);}
  const history=await rpc('get_messages');assert.doesNotMatch(JSON.stringify(history),/<zcode-memory-background>|BODY-ONLY-NATIVE/,'context output must remain transient in the real runtime');
  const beforeCompact=sent.length;await rpc('compact',{customInstructions:'Produce a short synthetic test summary.'});const compactionRequests=requests().length-beforeCompact;await turn('项目发布流程是什么');sent=requests();assert.match(background(sent.at(-1)),/sticky-native.md/);assert.match(background(sent.at(-1)),/BODY-ONLY-NATIVE/);
  const beforeForget=sent.length;await turn('FORGET-NATIVE 请遗忘项目发布流程');sent=requests();assert.equal(sent.length-beforeForget,2,'forget must cause a real tool continuation');assert.match(background(sent.at(-2)),/BODY-ONLY-NATIVE/);assert.doesNotMatch(background(sent.at(-1)),/sticky-native.md|BODY-ONLY-NATIVE/);await assert.rejects(service.tool('memory_read',{path:'sticky-native.md'}),{code:'NOT_FOUND'});
  const events=fs.readFileSync(trace,'utf8').trim().split('\n').map(s=>JSON.parse(s));assert.deepEqual(events.map(e=>e.event),['before_agent_start','context','before_agent_start','context','session_compact','before_agent_start','context','before_agent_start','context','context']);assert.equal(new Set(events.map(e=>e.session)).size,1);
  steps.push({mode,requests:sent.length,foregroundRequests:sent.length-compactionRequests,compactionRequests,turns:4,mcp:false,eventSequence:events.map(e=>e.event),transientHistory:true,forgetContinuation:true,compactionRebuilt:true});
 }finally{child.stdin.end();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();const timer=setTimeout(()=>child.kill(),1000);child.once('close',()=>{clearTimeout(timer);resolve();});});fs.writeFileSync(path.join(work,mode+'-stdout.jsonl'),stdout);fs.writeFileSync(path.join(work,mode+'-stderr.log'),stderr);}
}
(async()=>{
  const service=new HostMemory({host:'pi-cli',home:data,project});
  try{
    run('save','请保存项目发布流程，使用 memory_save。');
    assert.match((await service.tool('memory_read',{path:'native-pi.md'})).body,/staging/);
    assert.equal((await service.tool('memory_settings')).autoExtract,false);
    const recalled=run('recall','请用 memory_recall 读取项目发布流程。',true);
    assert.match(JSON.stringify(recalled.requests[0].messages),/native-pi.md/);
    assert.match(recalled.stdout,/staging/);assert.match(JSON.stringify(recalled.requests[0].messages),/mcp__zcode_memory/,'the real Pi MCP registry must connect the local server');
    assert.ok(recalled.requests.some(r=>JSON.stringify(r.messages).includes('memory_save')));
    await service.tool('memory_settings',{autoExtract:true});
    run('none','记住：以后请用中文回答。');
    assert.ok((await service.tool('memory_list')).facts.some(f=>String(f.description).includes('中文')),'completed native settlement must extract the Chinese preference');
    run('forget','请用 memory_forget 遗忘 native-pi.md。');
    await assert.rejects(service.tool('memory_read',{path:'native-pi.md'}),{code:'NOT_FOUND'});
    assert.equal((await service.tool('memory_stats')).stats.modelCalls,0,'local extraction must not invoke an auxiliary model');
    await service.tool('memory_settings',{autoExtract:false});await stickyRpc(service);
    const report={status:'passed',version:JSON.parse(fs.readFileSync(path.join(installed,'package.json'))).version,node:process.version,steps,adapter,work,installs,loading:'native persistent pi install; no temporary -e flags'};
    fs.writeFileSync(path.join(base,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await service.close();}
})().catch(error=>{fs.writeFileSync(path.join(base,'report.json'),JSON.stringify({status:'failed',error:error.message,steps,work},null,2));console.error(error);process.exitCode=1;});
