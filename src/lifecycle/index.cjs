'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{constants}=require('node:fs'),{spawnSync}=require('node:child_process');
const {plainPath,fail,atomicText,acquire}=require('../core/index.cjs');
const {NativeRpc}=require('./rpc.cjs');
const PLUGIN='zcode-memory@zcode-memory',RESOURCES=['extensions','skills','prompts','themes'];
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
async function snapshot(file){
  try{await plainPath(file);const h=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));try{const s=await h.stat();if(!s.isFile()||s.size>2*1024*1024)throw fail('INVALID_CONFIG','Configuration must be a regular file under 2 MiB');const text=await h.readFile('utf8'),after=await h.stat();if(s.size!==after.size||s.mtimeMs!==after.mtimeMs||s.ctimeMs!==after.ctimeMs)throw fail('LIFECYCLE_CONFIG_CHANGED','Configuration changed while reading; retry');return {exists:true,text,hash:digest(text),mode:s.mode&0o777};}finally{await h.close();}}catch(e){if(e.code==='ENOENT')return {exists:false,text:'',hash:null,mode:0o600};throw e;}
}
async function readJson(file,fallback={}){const s=await snapshot(file);return s.exists?JSON.parse(s.text):fallback;}
function location(options={}){
  const env=options.env??process.env,host=options.host;if(!['codex-cli','pi-cli'].includes(host))throw fail('NATIVE_MANAGER_REQUIRED','Use the native Claude/Kimi plugin manager or DSH/PI-Desktop manager. This bridge only supplies missing Codex toggles and scriptable Pi resource toggles.');
  const home=options.home??env.ZCODE_MEMORY_HOME??path.join(env.HOME??os.homedir(),'.zcode-memory');
  const configHome=host==='codex-cli'?(env.CODEX_HOME??path.join(env.HOME??os.homedir(),'.codex')):(env.PI_CODING_AGENT_DIR??path.join(env.HOME??os.homedir(),'.pi/agent'));
  return {host,env,root:path.join(path.resolve(home),'lifecycle',host),config:path.join(path.resolve(configHome),host==='codex-cli'?'config.toml':'settings.json')};
}
function piEntry(config,options,state){
  const choices=(config.packages??[]).map((entry,index)=>({entry,index,source:typeof entry==='string'?entry:entry.source}));
  const source=options.source??state.source;
  const base=path.dirname(location(options).config);
  const found=choices.filter(c=>source?(c.source===source||path.isAbsolute(source)&&!/^\w+:/.test(c.source??'')&&path.resolve(base,c.source??'')===path.resolve(source)):/(?:Rogers-F\/zcode-memory|npm:zcode-memory)(?:[.@/]|$)/i.test(c.source??''));
  if(found.length!==1){const error=fail('PACKAGE_SELECTION_REQUIRED','Pass --source exactly as shown by pi list; exactly one installed zcode-memory package must match');error.matches=found.length;throw error;}return found[0];
}
async function codexStatus(options,loc){
  const r=spawnSync(options.executable??'codex',['plugin','list','--marketplace','zcode-memory','--json'],{cwd:options.cwd??process.cwd(),env:loc.env,encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});
  if(r.status!==0)throw fail('NATIVE_COMMAND_FAILED',`codex plugin list failed: ${r.error?.message??r.stderr??'unknown error'}`);
  const plugin=JSON.parse(r.stdout).installed?.find(p=>p.pluginId===PLUGIN);return {host:loc.host,installed:!!plugin,enabled:plugin?.enabled??false,version:plugin?.version??null,config:loc.config,pluginId:PLUGIN,hookTrust:'unchanged; review in Codex',restartRequired:true};
}
async function status(options={},loc=location(options)){
  const state=await readJson(path.join(loc.root,'state.json'));
  if(loc.host==='codex-cli')return {...await codexStatus(options,loc),lastManagedVersion:state.version??null};
  const config=await readJson(loc.config);let found;try{found=piEntry(config,options,state);}catch(e){if(e.code==='PACKAGE_SELECTION_REQUIRED'&&e.matches===0)return {host:loc.host,installed:false,enabled:false,config:loc.config};throw e;}
  const enabled=typeof found.entry==='string'||!RESOURCES.every(k=>Array.isArray(found.entry[k])&&found.entry[k].length===0);
  return {host:loc.host,installed:true,enabled,source:found.source,config:loc.config,lastManagedVersion:state.version??null,restartRequired:true};
}
async function writeCodex(enabled,options,loc,before){
  const rpc=new NativeRpc(options.executable??'codex',['app-server'],{env:loc.env,cwd:options.cwd??process.cwd()});
  try{await rpc.request('initialize',{clientInfo:{name:'zcode-memory-lifecycle',version:require('../version.cjs')},capabilities:{experimentalApi:true}});rpc.notify('initialized');
    const read=await rpc.request('config/read',{includeLayers:true}),layer=read.layers?.find(l=>l.name?.type==='user'&&l.name.file===loc.config);
    if((await snapshot(loc.config)).hash!==before.hash)throw fail('LIFECYCLE_CONFIG_CHANGED','Codex config changed during operation; no overwrite performed');
    if(before.exists&&!layer?.version)throw fail('NATIVE_SCHEMA_UNSUPPORTED','Codex did not expose its user config layer version; refusing a blind write');
    await rpc.request('config/value/write',{filePath:loc.config,keyPath:`plugins."${PLUGIN}".enabled`,value:enabled,mergeStrategy:'upsert',...(layer?.version?{expectedVersion:layer.version}:{})});
  }finally{await rpc.close();}
}
async function restore(loc,transaction){
  const observed=await snapshot(loc.config);if(!transaction.afterHash||observed.hash!==transaction.afterHash)throw fail('LIFECYCLE_CONFIG_CHANGED','Configuration changed outside this transaction, or native completion is uncertain. No overwrite performed. Inspect the private backup and native manager status.');
  if(transaction.before.exists)await atomicText(path.dirname(loc.config),path.basename(loc.config),transaction.before.text);else await fs.rm(loc.config,{force:true});
  if(transaction.before.exists)await fs.chmod(loc.config,transaction.before.mode);
  await atomicText(loc.root,'state.json',JSON.stringify(transaction.previousState,null,2)+'\n');await fs.rm(path.join(loc.root,'transaction.json'),{force:true});
  return {host:loc.host,status:'recovered',memoryRetained:true};
}
async function manage(action,options={}){
  const loc=location(options);if(action==='status')return status(options,loc);
  if(!['enable','disable','recover'].includes(action)&&!(action==='update'&&loc.host==='codex-cli'))throw fail('NATIVE_MANAGER_REQUIRED','Install/remove with codex plugin; install/update/remove with pi. Use host enable/disable/status/recover for persistent toggles, or host update --host codex-cli to preserve the native enabled state.');
  await plainPath(loc.root,{create:true});const release=await acquire(loc.root,{});
  try{
    const journal=await readJson(path.join(loc.root,'transaction.json'),null);
    if(action==='recover'){if(!journal)return {host:loc.host,status:'no-pending-transaction',memoryRetained:true};return await restore(loc,journal);}
    if(journal)throw fail('LIFECYCLE_RECOVERY_REQUIRED','Run zcode-memory host recover with the same --host before another change.');
    const previousState=await readJson(path.join(loc.root,'state.json')),before=await snapshot(loc.config);let enabled=action==='enable';
    let nextConfig,selection,filters=previousState.previousFilters;
    if(loc.host==='codex-cli'){const installed=await codexStatus(options,loc);if(!installed.installed)throw fail('NOT_INSTALLED','Install zcode-memory@zcode-memory with codex plugin add first');if(action==='update')enabled=installed.enabled;}
    else{
      const config=before.exists?JSON.parse(before.text):{},found=piEntry(config,options,previousState);selection=found.source;const entry=typeof found.entry==='string'?{source:found.entry}:{...found.entry};
      if(previousState.source!==selection)filters=undefined;
      if(enabled&&filters&&previousState.enabled===false&&!RESOURCES.every(k=>Array.isArray(entry[k])&&entry[k].length===0))throw fail('LIFECYCLE_CONFIG_CHANGED','Pi resource selection changed since managed disable; use pi config to review the new selection instead of restoring stale filters.');
      if(!enabled){if(!filters||!RESOURCES.every(k=>Array.isArray(entry[k])&&entry[k].length===0))filters=Object.fromEntries(RESOURCES.map(k=>[k,Object.hasOwn(entry,k)?{present:true,value:entry[k]}:{present:false}]));for(const k of RESOURCES)entry[k]=[];}
      else for(const k of RESOURCES){if(filters?.[k]?.present)entry[k]=filters[k].value;else delete entry[k];}
      config.packages[found.index]=entry;nextConfig=JSON.stringify(config,null,2)+'\n';
    }
    const backup=`backup-${crypto.randomUUID()}.json`,transaction={schema:1,action,createdAt:new Date().toISOString(),before,previousState,afterHash:null,backup};
    await atomicText(loc.root,backup,JSON.stringify(transaction,null,2)+'\n');await atomicText(loc.root,'transaction.json',JSON.stringify(transaction,null,2)+'\n');
    try{
      if(loc.host==='codex-cli'){
        if(action==='update'){
          if((await snapshot(loc.config)).hash!==before.hash)throw fail('LIFECYCLE_CONFIG_CHANGED','Codex config changed before update; no update attempted');
          for(const args of [['plugin','marketplace','upgrade','zcode-memory','--json'],['plugin','add',PLUGIN,'--json']]){
            const r=spawnSync(options.executable??'codex',args,{cwd:options.cwd??process.cwd(),env:loc.env,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
            if(r.status!==0)throw fail('NATIVE_COMMAND_FAILED',`codex ${args.slice(0,3).join(' ')} failed: ${r.error?.message??r.stderr??'unknown error'}. Check native status; host recover restores configuration only, never cached plugin binaries.`);
          }
          const updated=await snapshot(loc.config);transaction.afterHash=updated.hash;await atomicText(loc.root,'transaction.json',JSON.stringify(transaction,null,2)+'\n');
          await writeCodex(enabled,options,loc,updated);
        }else await writeCodex(enabled,options,loc,before);
      }
      else await atomicText(path.dirname(loc.config),path.basename(loc.config),nextConfig,{beforePublish:async()=>{if((await snapshot(loc.config)).hash!==before.hash)throw fail('LIFECYCLE_CONFIG_CHANGED','Pi settings changed during operation; no overwrite performed');}});
      transaction.afterHash=(await snapshot(loc.config)).hash;await atomicText(loc.root,'transaction.json',JSON.stringify(transaction,null,2)+'\n');
      await options.afterWrite?.();
      const current=await status({...options,...(selection?{source:selection}:{})},loc);
      if(current.enabled!==enabled)throw fail('NATIVE_STATE_MISMATCH','Native settings override the requested state. Recover the transaction and inspect host policy.');
      const state={...previousState,version:require('../version.cjs'),enabled,source:selection??previousState.source,previousFilters:enabled?null:filters,changedAt:new Date().toISOString(),lastBackup:backup};
      await atomicText(loc.root,'state.json',JSON.stringify(state,null,2)+'\n');await fs.rm(path.join(loc.root,'transaction.json'),{force:true});
      return {...current,status:action==='update'?'updated':enabled?'enabled':'disabled',backup:path.join(loc.root,backup),memoryRetained:true};
    }catch(error){if((await snapshot(loc.config)).hash===before.hash)await fs.rm(path.join(loc.root,'transaction.json'),{force:true});throw error;}
  }finally{await release();}
}
module.exports={manage,status,location,piEntry};
