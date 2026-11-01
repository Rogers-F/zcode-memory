'use strict';
// Public installed executables only. Every config/cache/log is confined to .work.
const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),work=path.join(root,'.work/native/cli');
for(const dir of ['home','codex','claude','tmp','project'])fs.mkdirSync(path.join(work,dir),{recursive:true});
const env={PATH:process.env.PATH,HOME:path.join(work,'home'),USERPROFILE:path.join(work,'home'),TMPDIR:path.join(work,'tmp'),TMP:path.join(work,'tmp'),TEMP:path.join(work,'tmp'),CODEX_HOME:path.join(work,'codex'),CLAUDE_CONFIG_DIR:path.join(work,'claude'),CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',DISABLE_TELEMETRY:'1',ANTHROPIC_API_KEY:'local-scripted-unused',OPENAI_API_KEY:'local-scripted-unused',ZCODE_MEMORY_HOME:path.join(work,'memory'),NO_COLOR:'1'};
const publicHome=require('node:os').homedir();
const codex=process.env.CODEX_CLI_EXECUTABLE??path.join(publicHome,'.codex/packages/standalone/releases/0.164.0-aarch64-apple-darwin/bin/codex');
const claude=process.env.CLAUDE_CLI_EXECUTABLE??path.join(publicHome,'.local/share/pi-node',`node-${process.version}-${process.platform}-${process.arch}`,'lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe');
function run(file,args){return spawnSync(file,args,{cwd:path.join(work,'project'),env,encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});}
async function codexHooks(){
  const template=fs.readFileSync(path.join(root,'adapters/codex-cli/hooks.template.json'),'utf8').replaceAll('@ZCODE_MEMORY_ROOT@',process.env.ZCODE_MEMORY_CODEX_PACKAGE??root);
  fs.writeFileSync(path.join(work,'codex/hooks.json'),template);
  fs.writeFileSync(path.join(work,'codex/config.toml'),'check_for_update_on_startup = false\n[analytics]\nenabled = false\n[feedback]\nenabled = false\n[features]\napi_key_model_discovery = false\napps = false\n');
  const proc=spawn(codex,['app-server'],{cwd:path.join(work,'project'),env,stdio:['pipe','pipe','pipe']});
  let buffer='',errors='',next=1;const waiting=new Map(),notifications=[];
  proc.stderr.on('data',b=>errors+=b);
  proc.stdout.on('data',b=>{buffer+=b;let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);let value;try{value=JSON.parse(line);}catch{continue;}if(value.id!==undefined&&waiting.has(value.id)){const pending=waiting.get(value.id);waiting.delete(value.id);clearTimeout(pending.timer);value.error?pending.reject(new Error(JSON.stringify(value.error))):pending.resolve(value.result);}else notifications.push(value);}});
  function request(method,params){return new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>{waiting.delete(id);reject(new Error(`Codex ${method} timeout`));},15000);waiting.set(id,{resolve,reject,timer});proc.stdin.write(JSON.stringify({id,method,params})+'\n');});}
  try{
    const initialized=await request('initialize',{clientInfo:{name:'zcode-memory-native-check',version:'0.1.0'},capabilities:{experimentalApi:true}});
    proc.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    const hooks=await request('hooks/list',{cwds:[path.join(work,'project')]});
    const records=hooks.data??[],events=new Set(records.flatMap(value=>value.hooks??[]).map(hook=>hook.eventName));
    if(!['sessionStart','userPromptSubmit','stop'].every(name=>events.has(name))||records.some(value=>value.errors?.length))throw new Error('The installed Codex did not recognize all three hook contracts');
    fs.writeFileSync(path.join(work,'codex-hooks.json'),JSON.stringify({initialized,hooks,notifications},null,2));
    return {status:'inspected',hooks};
  }finally{proc.stdin.end();proc.kill();fs.writeFileSync(path.join(work,'codex-stderr.log'),errors);for(const p of waiting.values())clearTimeout(p.timer);}
}
(async()=>{
  const report={};
  if(fs.existsSync(claude)){
    const directory=process.env.ZCODE_MEMORY_CLAUDE_PLUGIN_ROOT??(fs.existsSync(path.join(root,'dist/claude-code'))?path.join(root,'dist/claude-code'):path.join(root,'adapters/claude-code'));
    const checked=run(claude,['--bare','plugin','validate',directory]);fs.writeFileSync(path.join(work,'claude-validation.log'),(checked.stdout??'')+(checked.stderr??''));
    report.claude={directory,status:checked.status===0?'manifest-validated':'validation-failed',exit:checked.status,output:(checked.stdout??'')+(checked.stderr??'')};
  }else report.claude={status:'unavailable'};
  if(fs.existsSync(codex))report.codex=await codexHooks();else report.codex={status:'unavailable'};
  fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(report.claude.exit||report.codex.status==='failed')process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
