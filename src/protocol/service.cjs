'use strict';
const path=require('node:path');const os=require('node:os');const core=require('../core/index.cjs');
const CAPABILITIES={
  'pi-desktop':{panel:true,settings:true,automatic:'opt-in; desktop completed-turn signals',subagents:false},
  dsh:{panel:true,settings:true,automatic:'opt-in; completed DSH turns; native tool guards',subagents:'explicit custom scope only'},
  'claude-code':{panel:false,automatic:'opt-in; hooks; scripted/local extraction by default',subagents:false},
  'codex-cli':{panel:false,automatic:'opt-in; version-dependent hooks; manual MCP fallback',subagents:false},
  'pi-cli':{panel:false,automatic:'opt-in; native settlement events',subagents:false},
  'kimi-cli':{panel:false,automatic:'opt-in; enabled plugin hooks; UserPromptSubmit context, Stop local extraction; PostCompact resets receipts',subagents:false},
};
const TOOL_DESCRIPTIONS={memory_repair:'Explicitly reimport an externally changed file or detach its tracking without modifying external content.',memory_save:'Save a durable fact. Conflicts are preserved, never silently overwritten. Use expectedRevision for explicit updates.',memory_read:'Read one memory file or MEMORY.md in this host and scope.',memory_list:'List memory names and provenance without loading all bodies into context.',memory_recall:'Search Chinese/English memory using BM25, recency and importance within strict budgets.',memory_forget:'Forget with a restorable archive. Explicit purge:true irreversibly removes this path and its unified archives; disk secure erasure is not guaranteed.',memory_restore:'Restore an archived version; an existing different version becomes a conflict unless explicitly updated.',memory_dream:'Preview or explicitly apply consolidation. No real model is called by default.',memory_stats:'Query settings, usage, source provenance and host capabilities.',memory_settings:'Read/update explicit extraction switches and recall budgets.',memory_import:'Copy legacy Markdown from an explicitly mapped source directory; never modify the source.',memory_export:'Export an immutable, hash-checked memory exchange snapshot.'};
function schema(name) {
  const properties={scope:{type:'string',enum:['personal','project','agent']},agent:{type:'string'},agentScope:{type:'string',enum:['user','project','local']}};
  const required=[];const add=(key,type,req=false)=>{properties[key]={type};if(req)required.push(key);};
  if(name==='memory_save'){add('body','string',true);add('path','string');add('name','string');properties.type={type:'string',enum:core.TYPES};add('expectedRevision','string');add('relatedPath','string');add('expectedRelatedRevision','string');properties.relation={type:'string',enum:['equivalent','supersedes','conflicts']};add('importance','number');add('operationId','string');}
  if(['memory_read','memory_forget'].includes(name))add('path','string',true);
  if(name==='memory_forget'){add('expectedRevision','string');add('purge','boolean');}
  if(name==='memory_repair'){add('path','string',true);properties.action={type:'string',enum:['reimport','detach']};required.push('action');}
  if(name==='memory_restore'){add('archiveId','string',true);add('expectedRevision','string');}
  if(name==='memory_recall'){add('query','string',true);for(const k of ['maxChars','maxItems','maxTokens'])add(k,'integer');}
  if(name==='memory_dream'){add('apply','boolean');add('useModel','boolean');}
  if(name==='memory_settings'){add('autoExtract','boolean');add('modelEnabled','boolean');properties.recall={type:'object',properties:Object.fromEntries(['maxChars','maxItems','maxTokens','maxSessionChars','maxSessionTokens'].map(k=>[k,{type:'integer',minimum:0}])),additionalProperties:false};properties.recall.properties.semantic={type:'object',properties:{enabled:{type:'boolean'},minRelevance:{type:'number',minimum:0,maximum:1},...Object.fromEntries(['maxCandidates','maxInputChars','maxOutputTokens','timeoutMs'].map(k=>[k,{type:'integer',minimum:0}]))},additionalProperties:false};properties.extraction={type:'object',properties:{maxInputChars:{type:'integer',minimum:0},maxExistingChars:{type:'integer',minimum:0},maxFacts:{type:'integer',minimum:0,maximum:50},maxModelCalls:{type:'integer',minimum:0,maximum:1}},additionalProperties:false};}
  if(name==='memory_import'){add('sourceDir','string',true);add('sourceHost','string',true);add('sourceProject','string',true);properties.settings={type:'object',properties:{autoExtract:{type:'boolean'},extractionEnabled:{type:'boolean'},enabled:{type:'boolean'}},additionalProperties:false};}
  return {type:'object',properties,required,additionalProperties:false};
}
const tools=Object.keys(TOOL_DESCRIPTIONS).map(name=>({name,description:TOOL_DESCRIPTIONS[name],inputSchema:schema(name),annotations:{readOnlyHint:['memory_read','memory_list','memory_recall','memory_stats','memory_export'].includes(name),destructiveHint:['memory_forget','memory_restore'].includes(name),openWorldHint:name==='memory_import'}}));
function validate(name,args){const spec=schema(name);if(!args||typeof args!=='object'||Array.isArray(args))throw core.fail('INVALID_ARGUMENT','Tool arguments must be an object');for(const key of Object.keys(args))if(!Object.hasOwn(spec.properties,key))throw core.fail('INVALID_ARGUMENT',`Unknown argument ${key}`);for(const key of spec.required)if(args[key]===undefined)throw core.fail('INVALID_ARGUMENT',`Missing ${key}`);for(const [key,value] of Object.entries(args)){const p=spec.properties[key];const valid=p.type==='integer'?Number.isInteger(value):p.type==='object'?value&&typeof value==='object'&&!Array.isArray(value):typeof value===p.type;if(!valid||p.enum&&!p.enum.includes(value))throw core.fail('INVALID_ARGUMENT',`Invalid ${key}`);}}
class HostMemory {
  constructor(options={}){
    const supplied=Object.fromEntries(Object.entries(options).filter(([,v])=>v!==undefined));
    this.options={...supplied,home:supplied.home??process.env.ZCODE_MEMORY_HOME??path.join(os.homedir(),'.zcode-memory'),project:supplied.project??process.cwd()};
    if(!CAPABILITIES[this.options.host])throw core.fail('INVALID_HOST','Explicit supported host required');
    this.stores=new Map();this.engines=new Map();this.sessions=new Map();this.events={};this.lifecycle=new AbortController();
  }
  store(args={}){
    const scope=args.scope??this.options.scope??'project',agent=args.agent??this.options.agent,agentScope=args.agentScope??'project';const key=JSON.stringify([scope,agent,agentScope]);
    if(!this.stores.has(key)){const located=this.options.root&&scope===(this.options.scope??'project')&&agent===this.options.agent?{root:this.options.root,identity:core.identity(this.options)}:core.storePath({...this.options,scope,agent,agentScope});this.stores.set(key,new core.MemoryStore({root:located.root,host:this.options.host,project:located.identity.key,scope,agent,readOnly:this.options.readOnly}));}
    return this.stores.get(key);
  }
  async prepare(args={}){const store=this.store(args);if(store.scope!=='personal')store.inheritedSettings=(await this.store({scope:'personal'}).catalog()).settings;return store;}
  engine(args={}){const store=this.store(args);if(!this.engines.has(store.root))this.engines.set(store.root,new core.MemoryEngine({store,personalStore:store.scope==='project'?this.store({scope:'personal'}):null,model:this.options.model}));return this.engines.get(store.root);}
  async visible(args={},options={}){
    const store=await this.prepare(args);const snap=await store.catalog(options);let facts=snap.facts.map(f=>({...f,_store:store}));let issues=snap.issues;
    if(!args.scope&&store.scope==='project'){const personal=this.store({scope:'personal'}),p=await personal.catalog(options);facts.push(...p.facts.map(f=>({...f,_store:personal})));issues=[...issues,...p.issues];snap.archives={...snap.archives,...Object.fromEntries(Object.entries(p.archives).map(([id,entry])=>[id,{...entry,scope:'personal'}]))};}
    const personalHashes=new Set(facts.filter(f=>f._store.scope==='personal').map(f=>f.hash).filter(Boolean));facts=facts.filter(f=>f._store.scope!=='project'||!['user','feedback'].includes(f.type)||!personalHashes.has(f.hash));return {...snap,facts,issues};
  }
  async pathStore(args,context={}){const primary=await this.prepare(args);if(args.scope||primary.scope!=='project')return primary;const contains=snap=>snap.facts.some(f=>f.path===args.path)||snap.issues.some(f=>f.path===args.path)||Object.values(snap.archives).some(f=>f.path===args.path);if(contains(await primary.catalog(context)))return primary;const personal=this.store({scope:'personal'});return contains(await personal.catalog(context))?personal:primary;}
  async recall(query,args={},context={}){const store=await this.prepare(args);const catalog=await this.visible(args,context);const result=await core.recall(store,query,{...args,...context,catalog,refreshCatalog:()=>this.visible(args,context),model:this.options.model,...(this.options.semanticEnabled!==undefined?{semantic:{...catalog.settings.recall.semantic,enabled:this.options.semanticEnabled}}:{})});this.events.recall={at:new Date().toISOString(),...result.diagnostics};return result;}
  async tool(name,args={},options={}){
    if(!TOOL_DESCRIPTIONS[name])throw core.fail('UNKNOWN_TOOL','Unknown memory tool');validate(name,args);
    const session=options.session??this.options.session??'manual';const context={...options,session,operationId:args.operationId};
    const store=await this.prepare(args);this.events[name]={at:new Date().toISOString(),status:'triggered'};
    if(name==='memory_save'){const target=!args.scope&&['user','feedback'].includes(args.type)?await this.prepare({scope:'personal'}):store;return {...await target.save(args,context),scope:target.scope};}
    if(name==='memory_read'||name==='memory_forget'){
      const perform=async target=>name==='memory_read'?target.read(args.path,context):target.forget(args.path,{...context,purge:args.purge,expectedRevision:args.expectedRevision});
      let target=await this.pathStore(args,context),value,prior;try{if(name==='memory_forget')try{prior=await target.read(args.path,context);}catch{}value=await perform(target);}catch(e){if(args.scope||store.scope!=='project'||e.code!=='NOT_FOUND')throw e;target=this.store({scope:'personal'});value=await perform(target);}
      if(name==='memory_forget'&&value.status==='missing'&&!args.scope&&store.scope==='project'){target=this.store({scope:'personal'});value=await perform(target);}
      if(name==='memory_forget'){if(!args.scope&&store.scope==='project'&&prior&&['user','feedback'].includes(prior.type)){const personal=this.store({scope:'personal'});try{const other=await personal.read(args.path,context);if(other.hash===prior.hash)await personal.forget(args.path,{...context,purge:args.purge});}catch(error){if(error.code!=='NOT_FOUND')throw error;}}return {...value,scope:target.scope};}
      return {path:value.path,content:value.content,revision:value.revision,scope:target.scope,...(value.body!==undefined?{body:value.body,type:value.type,source:value.data?.unified??{}}:{})};
    }
    if(name==='memory_list'){const snap=await this.visible(args,context);return {generation:snap.generation,index:core.indexText(snap.facts),facts:snap.facts.map(f=>({path:f.path,type:f.type,scope:f._store.scope,revision:f.revision,name:f.data.name??f.path,description:f.data.description??'',source:f.data.unified??{legacy:true}})),issues:snap.issues,archives:snap.archives};}
    if(name==='memory_recall')return this.recall(args.query,args,context);
    if(name==='memory_repair')return (await this.pathStore(args,context)).repair(args.path,{...context,action:args.action});
    if(name==='memory_restore'){let target=store;if(!args.scope&&store.scope==='project'&&!(await store.catalog(context)).archives[args.archiveId])target=this.store({scope:'personal'});return target.restore(args.archiveId,{...context,expectedRevision:args.expectedRevision});}
    if(name==='memory_dream')return this.engine(args).dream({...args,...context});
    if(name==='memory_stats'){const snap=await store.catalog(context);return {host:this.options.host,project:store.project,scope:store.scope,settings:snap.settings,stats:snap.stats,index:snap.index,issues:snap.issues,generation:snap.generation,capabilities:{...CAPABILITIES[this.options.host],semanticAvailable:typeof this.options.model?.recall==='function',events:{...await store.observations(),...this.events},degradation:typeof this.options.model?.recall==='function'?((this.events.injection??this.events.recall)?.mode==='fallback'?(this.events.injection??this.events.recall).reason:null):'No explicit model.recall bridge; local BM25'},sharedWrites:false,statisticsDurability:'read counters buffered, flushed with next mutation; events best effort'};}
    if(name==='memory_settings'){const {scope,agent,agentScope,...patch}=args;const settingsStore=args.scope?store:this.store({scope:'personal'});return Object.keys(patch).length?settingsStore.configure(patch,context):(await settingsStore.catalog(context)).settings;}
    if(name==='memory_import'){
      if(this.options.importRoots&&!this.options.importRoots.some(root=>{const relative=path.relative(path.resolve(root),path.resolve(args.sourceDir));return relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);} ))throw core.fail('PERMISSION_DENIED','Import requires an approved workspace source; use explicit standalone CLI for legacy locations');
      return core.importDirectory(store,{...args,...context});
    }
    if(name==='memory_export')return store.export(context);
  }
  async injection(options={}){return require('./injection.cjs').injection(this,options);}
  async resetInjection(session,options={}){this.sessions.delete(session);if(require('./injection.cjs').PERSISTENT.has(this.options.host))return (await this.prepare()).resetInjection(session,options);}
  async event(name,detail={}){const value={at:new Date().toISOString(),...detail};this.events[name]=value;await this.store().observe(name,value);}
  async completed(snapshot,options={}){await this.event('completed',{status:snapshot.outcome??'completed'});await this.prepare();return this.engine().schedule(snapshot,options);}
  async close(){this.lifecycle.abort();for(const engine of this.engines.values())engine.close();await Promise.all([...this.engines.values()].map(e=>e.drain()));}
}
module.exports={HostMemory,tools,CAPABILITIES,validate};
