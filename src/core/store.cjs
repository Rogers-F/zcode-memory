'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {constants,renameSync}=require('node:fs');
const {hash,normalize,semanticText,semanticSignature,similarity,tokens,assertSafe}=require('./text.cjs');
const {parseFact,renderFact,mergeFactContent,indexText}=require('./format.cjs');
const {fail,abort,slug,plainPath,relativeFile,readSafe}=require('./paths.cjs');
const sleep=(ms,signal)=>new Promise((resolve,reject)=>{abort(signal);const end=()=>{signal?.removeEventListener('abort',cancel);resolve();};const t=setTimeout(end,ms);const cancel=()=>{clearTimeout(t);reject(signal.reason??new DOMException('Aborted','AbortError'));};signal?.addEventListener('abort',cancel,{once:true});});
const semanticDefaults=()=>({enabled:false,maxCandidates:64,maxInputChars:12000,maxOutputTokens:512,timeoutMs:5000,minRelevance:0.7});
function mergeSettings(base,patch={}){return {...base,...patch,recall:{...base.recall,...patch.recall,semantic:{...semanticDefaults(),...base.recall?.semantic,...patch.recall?.semantic}},extraction:{...base.extraction,...patch.extraction}};}
const emptyState=()=>({version:1,generation:0,facts:{},archives:{},operations:{},checkpoints:{},explicitSettings:{},settings:{autoExtract:false,modelEnabled:false,recall:{maxChars:6000,maxItems:5,maxTokens:2000,maxSessionChars:24000,maxSessionTokens:8000,semantic:semanticDefaults()},extraction:{maxInputChars:24000,maxExistingChars:12000,maxFacts:30,maxModelCalls:1}},stats:{saved:0,duplicates:0,conflicts:0,forgotten:0,recalled:0,modelCalls:0}});
const pendingStats=new Map();
const diskStamp=s=>({size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,ino:s.ino});
const sameStamp=(a,b)=>a&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.ino===b.ino;
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
async function exists(p){try{return await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function atomicText(root,rel,content,{signal,beforePublish}={}) {
  const {full}=relativeFile(root,rel,{internal:true});await plainPath(path.dirname(full),{create:true});
  const old=await exists(full);if(old&&(old.isSymbolicLink()||!old.isFile()))throw fail('UNSAFE_PATH','Commit target is not a regular file');
  const temp=path.join(path.dirname(full),`.zmemory-${randomUUID()}.tmp`);let fd;
  try {abort(signal);fd=await fs.open(temp,'wx',0o600);await fd.writeFile(content,{encoding:'utf8',signal});await fd.sync();await fd.close();fd=null;await plainPath(path.dirname(full));const current=await exists(full);if(current?.isSymbolicLink())throw fail('UNSAFE_PATH','Commit target became a symlink');await beforePublish?.();abort(signal);if(signal)renameSync(temp,full);else await fs.rename(temp,full);try{const d=await fs.open(path.dirname(full),'r');try{await d.sync();}finally{await d.close();}}catch(e){if(!['EINVAL','EPERM','EISDIR','EBADF'].includes(e.code))throw e;}}
  finally {await fd?.close();await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
// Lamport bakery lock: each contender owns an immutable UUID directory. Dead
// contenders can be removed without a second, itself crash-prone recovery lock.
// This protocol is for local filesystems with atomic rename/readdir visibility.
async function acquire(root,{signal,timeoutMs=15000}={}) {
  await plainPath(root,{create:true});
  const directory=path.join(root,'.unified','locks');
  await plainPath(directory,{create:true});
  const name=`${process.pid}-${randomUUID()}`,claim=path.join(directory,name);
  const start=Date.now();let held=false;
  const check=()=>{abort(signal);if(Date.now()-start>timeoutMs)throw fail('STORE_BUSY','Another writer owns this memory space');};
  async function contenders(){
    const list=[];
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      if(!/^([1-9][0-9]*)-[a-f0-9-]{36}$/u.test(entry.name)||!entry.isDirectory()||entry.isSymbolicLink())throw fail('UNSAFE_PATH','Unsafe writer claim');
      if(entry.name===name)continue;
      const pid=Number(entry.name.slice(0,entry.name.indexOf('-')));
      const target=path.join(directory,entry.name);
      if(!alive(pid)){await fs.rm(target,{recursive:true,force:true});continue;}
      let owner;
      try{owner=JSON.parse((await readSafe(root,`.unified/locks/${entry.name}/owner.json`,{internal:true,maxBytes:1024})).content);}
      catch(error){if(error.code==='ENOENT'){
        if(!await exists(target))continue;
        // A live contender may still be publishing its choosing state.
        owner={choosing:true,ticket:0};
      }else throw error;}
      if(typeof owner.choosing!=='boolean'||!Number.isSafeInteger(owner.ticket)||owner.ticket<0)throw fail('UNSAFE_PATH','Invalid writer claim');
      list.push({name:entry.name,...owner});
    }
    return list;
  }
  try{
    await fs.mkdir(claim,{mode:0o700});held=true;
    await atomicText(root,`.unified/locks/${name}/owner.json`,JSON.stringify({choosing:true,ticket:0}));
    const ticket=1+Math.max(0,...(await contenders()).map(x=>x.ticket));
    if(!Number.isSafeInteger(ticket))throw fail('STORE_BUSY','Writer ticket exhausted');
    await atomicText(root,`.unified/locks/${name}/owner.json`,JSON.stringify({choosing:false,ticket}));
    while(true){
      check();
      const ahead=(await contenders()).some(x=>x.choosing||x.ticket<ticket||x.ticket===ticket&&x.name<name);
      if(!ahead)break;
      await sleep(12,signal);
    }
    held=false;
    return async()=>{await fs.rm(claim,{recursive:true,force:true});};
  }finally{if(held)await fs.rm(claim,{recursive:true,force:true});}
}
async function markdownFiles(root,dir='',issues) {const out=[];let entries;try{entries=await fs.readdir(path.join(root,dir),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return [];throw e;}
  for(const entry of entries){if(entry.name.startsWith('.'))continue;const rel=dir?`${dir}/${entry.name}`:entry.name;if(entry.isSymbolicLink()){if(issues){issues.push({path:rel,code:'UNSAFE_PATH',reason:'symlink skipped'});continue;}throw fail('UNSAFE_PATH','Symlink found in memory library');}if(entry.isDirectory())out.push(...await markdownFiles(root,rel,issues));else if(entry.isFile()&&entry.name.endsWith('.md')&&rel!=='MEMORY.md')out.push(rel);}return out.sort();}
class MemoryStore {
  constructor(options){if(!options?.root)throw new TypeError('Memory root required');this.root=path.resolve(options.root);this.host=options.host??'unknown';this.project=options.project??'unknown';this.scope=options.scope??'project';this.agent=options.agent;this.readOnly=options.readOnly===true;this.now=options.now??(()=>new Date().toISOString());this.fault=options.fault;}
  async _load(){let state;try{state=JSON.parse((await readSafe(this.root,'.unified/state.json',{internal:true,maxBytes:32*1024*1024})).content);}catch(e){if(e.code!=='ENOENT')throw e;state=emptyState();const skipped=[];for(const rel of await markdownFiles(this.root,'',skipped)){try{const r=await readSafe(this.root,rel);assertSafe(r.content);parseFact(r.content);state.facts[rel]={revision:r.revision};}catch(error){skipped.push({path:rel,code:error.code??'INVALID_FACT',reason:'invalid initial file; repair explicitly'});}}state.issues=skipped;}if(state.version!==1)throw fail('SCHEMA_VERSION','Unsupported memory schema');if(!state.explicitSettings){state.explicitSettings={};for(const [k,v]of Object.entries(state.settings??{}))if(JSON.stringify(v)!==JSON.stringify(emptyState().settings[k]))state.explicitSettings[k]=v;}state.settings=mergeSettings(mergeSettings(emptyState().settings,this.inheritedSettings),state.explicitSettings);return state;}
  async _recover(){let journal;try{journal=JSON.parse((await readSafe(this.root,'.unified/journal.json',{internal:true,maxBytes:64*1024*1024})).content);}catch(e){if(e.code==='ENOENT')return;throw e;}
    if(this.readOnly)throw fail('RECOVERY_REQUIRED','A writer must finish the pending transaction before reading');
    if(journal.version!==1||!journal.state||typeof journal.writes!=='object')throw fail('INVALID_JOURNAL','Invalid transaction journal');
    await this._apply(journal,true);}
  async _apply(plan,recovery=false){let count=0;for(const [rel,content] of Object.entries(plan.writes)){
      if(rel!=='MEMORY.md'&&!rel.startsWith('.unified/archive/'))relativeFile(this.root,rel);
      if(rel.startsWith('.unified/')&&!/^\.unified\/archive\/[a-f0-9-]+\.md$/u.test(rel))throw fail('INVALID_JOURNAL','Unexpected internal journal path');
      if(content===null){const {full}=relativeFile(this.root,rel,{internal:true});await plainPath(path.dirname(full));const s=await exists(full);if(s?.isSymbolicLink())throw fail('UNSAFE_PATH','Refusing symlink removal');await fs.unlink(full).catch(e=>{if(e.code!=='ENOENT')throw e;});}
      else {if(typeof content!=='string')throw fail('INVALID_JOURNAL','Invalid journal content');await atomicText(this.root,rel,content);}
      if(!recovery)await this.fault?.('after-file',{rel,count:++count});
    }
    for(const [rel,entry] of Object.entries(plan.state.facts)){if(plan.writes[rel]!==undefined||!entry.stat){try{entry.stat=diskStamp(await fs.lstat(path.join(this.root,rel)));}catch{delete entry.stat;}}}
    await atomicText(this.root,'.unified/state.json',JSON.stringify(plan.state,null,2)+'\n');
    await fs.unlink(path.join(this.root,'.unified/journal.json'));
  }
  async _access(write,fn,{signal,metadataOnly=false,paths}={}){
    abort(signal);if(write&&this.readOnly)throw fail('READ_ONLY','Memory writes are disabled');
    if(!write&&!await exists(this.root)){const initial=emptyState();initial.settings=mergeSettings(initial.settings,this.inheritedSettings);return fn(initial,[]);}
    // Readers use the atomic state publication + WAL as a seqlock. No lock
    // claim/fsync or statistics transaction is needed on the normal read path.
    for(let attempt=0;attempt<8;attempt++){
      let release;
      if(write||await exists(path.join(this.root,'.unified/journal.json'))){release=await acquire(this.root,{signal});}
      try{
        abort(signal);if(release)await this._recover();const state=await this._load(),facts=[],issues=(state.issues??[]).filter(i=>!state.facts[i.path]);
        const entries=Object.entries(state.facts).filter(([rel])=>!paths||paths.includes(rel));
        for(let offset=0;offset<entries.length;offset+=32){await Promise.all(entries.slice(offset,offset+32).map(async([rel,entry])=>{
          try{
            relativeFile(this.root,rel);const stat=await fs.lstat(path.join(this.root,rel));if(stat.isSymbolicLink()||!stat.isFile())throw fail('UNSAFE_PATH','Not a regular fact');
            if(metadataOnly&&entry.search&&sameStamp(entry.stat,stat)){facts.push({path:rel,...entry});return;}
            const read=await readSafe(this.root,rel);if(read.revision!==entry.revision)throw fail('EXTERNAL_CHANGE','External edit isolated; use memory_repair action reimport or detach');assertSafe(read.content);facts.push({path:rel,content:read.content,revision:read.revision,...parseFact(read.content)});
          }catch(error){issues.push({path:rel,code:error.code??'INVALID_FACT',reason:'Isolated; memory_repair {path,action:"reimport"|"detach"}; external content is preserved'});}
        }));}
        facts.sort((a,b)=>a.path.localeCompare(b.path));state.issues=issues;
        if(!release){if(await exists(path.join(this.root,'.unified/journal.json')))continue;const current=await this._load();if(current.generation!==state.generation)continue;}
        return await fn(state,facts);
      }finally{await release?.();}
    }
    throw fail('STORE_BUSY','Concurrent publication; retry the read');
  }
  async _commit(state,facts,writes,{signal}={}) {
    abort(signal);const pending={...(pendingStats.get(this.root)??{})};for(const [k,v]of Object.entries(pending))state.stats[k]=(state.stats[k]??0)+v;state.generation++;const index=indexText(facts);state.index={omitted:index.omitted,total:index.total};writes['MEMORY.md']=index.content;
    for(const fact of facts){if(fact.body===undefined&&fact.search)continue;const words=tokens(`${fact.data.name??''} ${fact.data.description??''} ${fact.body}`);const counts=Object.create(null);for(const word of words)counts[word]=(Object.hasOwn(counts,word)?counts[word]:0)+1;state.facts[fact.path]={revision:fact.revision,hash:fact.hash,type:fact.type,data:{name:fact.data.name,description:fact.data.description,unified:fact.data.unified},search:{counts,length:words.length}};}
    await this.fault?.('before-journal',{state,writes});abort(signal);
    for(const rel of Object.keys(writes)){
      abort(signal);
      const {full}=relativeFile(this.root,rel,{internal:true});
      try{await plainPath(full);const stat=await fs.lstat(full);if(!stat.isFile())throw fail('UNSAFE_PATH','Commit target must be a regular file');await fs.access(full,constants.W_OK);}catch(error){if(error.code!=='ENOENT')throw error;}
      let parent=path.dirname(full);while(!await exists(parent))parent=path.dirname(parent);
      await plainPath(parent);await fs.access(parent,constants.W_OK);
    }
    const plan={version:1,id:randomUUID(),writes,state};const serialized=JSON.stringify(plan);
    if(Buffer.byteLength(JSON.stringify(state))>32*1024*1024||Buffer.byteLength(serialized)>64*1024*1024)throw fail('TRANSACTION_TOO_LARGE','Transaction exceeds recoverable state/journal limits; use a smaller batch');
    await atomicText(this.root,'.unified/journal.json',serialized,{signal,beforePublish:()=>this.fault?.('before-journal-publish')});
    const remaining=pendingStats.get(this.root);if(remaining)for(const[k,v]of Object.entries(pending))remaining[k]=(remaining[k]??0)-v;
    // Durable WAL is the linearization point. Cancellation before it has no effects;
    // after it the commit must finish (or be replayed) to preserve facts/index consistency.
    await this.fault?.('after-journal',plan);await this._apply(plan);return state;
  }
  _provenance(options={}) {return {kind:options.origin??(options.source?'imported':'manual'),host:this.host,session:String(options.session??'manual'),at:this.now(),scope:this.scope,agent:this.agent??null,project:this.project,operation:options.operationId??randomUUID(),...(options.source?{importedFrom:options.source}:{})};}
  _archive(state,fact,writes,reason){const id=randomUUID();const rel=`.unified/archive/${id}.md`;writes[rel]=fact.content;state.archives[id]={path:fact.path,revision:fact.revision,reason,at:this.now()};return id;}
  async snapshot(options={}) {return this._access(false,(state,facts)=>{const stats={...state.stats};for(const[k,v]of Object.entries(pendingStats.get(this.root)??{}))stats[k]=(stats[k]??0)+v;return {generation:state.generation,index:indexText(facts),facts,issues:state.issues??[],settings:structuredClone(state.settings),stats,checkpoints:structuredClone(state.checkpoints),archives:structuredClone(state.archives)};},options);}
  async catalog(options={}) {return this.snapshot({...options,metadataOnly:true});}
  async read(name,options={}) {const rel=relativeFile(this.root,name).rel;return this._access(false,(state,facts)=>{if(rel==='MEMORY.md')return {path:rel,content:indexText(facts).content,revision:hash(indexText(facts).content)};const fact=facts.find(x=>x.path===rel);if(!fact){const issue=state.issues?.find(i=>i.path===rel);if(issue)throw fail(issue.code,issue.reason);throw fail('NOT_FOUND','Memory not found');}return fact;},{...options,...(rel==='MEMORY.md'?{metadataOnly:true}:{paths:[rel]})});}
  async save(input,options={}) {return this.apply([{...input,action:'save'}],options).then(r=>r.results[0]);}
  async apply(operations,options={}) {
    if(!Array.isArray(operations)||operations.length>50)throw fail('INVALID_OPERATIONS','At most 50 memory operations per transaction');
    return this._access(true,async(state,facts)=>{
      const opId=options.operationId;
      if(opId&&Object.hasOwn(state.operations,opId))return {...state.operations[opId],replayed:true};
      const writes={},results=[];
      for(const input of operations){abort(options.signal);const action=input.action??'save';
        if(action==='forget'||action==='detach'){
          const rel=relativeFile(this.root,input.path).rel;const pos=facts.findIndex(x=>x.path===rel);
          if(options.origin==='extracted'&&pos>=0&&facts[pos].data.unified?.sourceKind!=='extracted')throw fail('MANUAL_MEMORY_PROTECTED','Automatic extraction cannot forget a manual or imported fact');
          if(input.purge){for(const[id,entry]of Object.entries(state.archives))if(entry.path===rel){writes[`.unified/archive/${id}.md`]=null;delete state.archives[id];}}
          if(pos<0||action==='detach'){
            const known=!!state.facts[rel];delete state.facts[rel];state.issues=state.issues.filter(i=>i.path!==rel);if(pos>=0)facts.splice(pos,1);
            if(input.purge&&await exists(path.join(this.root,rel)))writes[rel]=null;
            results.push({status:input.purge?'purged':known?'detached':'missing',path:rel,...(!input.purge?{externalFilePreserved:true}:{} )});continue;
          }
          const old=facts[pos];if(input.expectedRevision&&old.revision!==input.expectedRevision)throw fail('FILE_CHANGED','Memory changed before forget');const archiveId=input.purge?undefined:this._archive(state,old,writes,'forget');writes[rel]=null;delete state.facts[rel];facts.splice(pos,1);state.issues=state.issues.filter(i=>i.path!==rel);state.stats.forgotten++;results.push({status:input.purge?'purged':'forgotten',path:rel,...(archiveId?{archiveId}:{})});continue;
        }
        if(action!=='save')throw fail('INVALID_OPERATION','Unsupported memory operation');
        if(typeof input.body!=='string'&&typeof input.content!=='string')throw fail('INVALID_FACT','Memory content required');
        assertSafe(JSON.stringify({body:input.body,content:input.content,name:input.name,description:input.description}));
        const parsed=parseFact(input.content??input.body);if(!parsed.body.trim())throw fail('INVALID_FACT','Empty memory refused');
        if(input.importance!==undefined&&(!Number.isFinite(input.importance)||input.importance<0||input.importance>1))throw fail('INVALID_FACT','Importance must be a finite number from 0 to 1');
        if(Buffer.byteLength(parsed.body)>5*1024*1024)throw fail('FILE_TOO_LARGE','Memory exceeds 5 MiB');
        const target=input.path?relativeFile(this.root,input.path).rel:`${slug(input.name??parsed.data.name??parsed.body.slice(0,36))}-${parsed.hash.slice(0,8)}.md`;
        if(target==='MEMORY.md'){results.push({status:'index-managed',path:target});continue;}
        let existing=facts.find(x=>x.path===target);
        if(input.externalRevision){const read=await readSafe(this.root,target);if(read.revision!==input.externalRevision)throw fail('FILE_CHANGED','External repair source changed');existing={path:target,content:read.content,revision:read.revision,...parseFact(read.content)};const p=facts.findIndex(f=>f.path===target);if(p<0)facts.push(existing);else facts[p]=existing;state.facts[target]={revision:read.revision};state.issues=state.issues.filter(i=>i.path!==target);}
        if(!existing&&state.facts[target])throw fail('EXTERNAL_CHANGE','Isolated target; use memory_repair reimport or detach before saving');
        if(!existing&&await exists(path.join(this.root,target))&&!input.externalRevision){await plainPath(path.join(this.root,target));throw fail('UNTRACKED_FILE','Untracked file preserved; use memory_repair reimport');}
        if(input.relatedPath){const selected=facts.find(f=>f.path===relativeFile(this.root,input.relatedPath).rel);if(!selected)throw fail('NOT_FOUND','Related memory not found');if(input.expectedRelatedRevision!==undefined&&selected.revision!==input.expectedRelatedRevision)throw fail('FILE_CHANGED','Related memory changed since extraction');if(input.relation==='supersedes'&&input.expectedRelatedRevision===undefined)throw fail('READ_REQUIRED','Supersession requires expectedRelatedRevision');}
        if(input.expectedRevision!==undefined&&(existing?.revision??null)!==input.expectedRevision)throw fail('FILE_CHANGED','Memory changed since read');
        const exact=facts.find(x=>x.hash===parsed.hash&&!x.data.unified?.supersededBy);
        const duplicate=(fact,semantic=false)=>{
          state.stats.duplicates++;
          const provenance={...this._provenance(options),...(input.importKey?{importKey:input.importKey}:{})};
          const known=fact.data.unified?.sources??[];
          const seen=known.some(s=>s.host===provenance.host&&s.session===provenance.session&&s.scope===provenance.scope&&s.importKey===provenance.importKey&&JSON.stringify(s.importedFrom)===JSON.stringify(provenance.importedFrom));
          if(!seen){
            if(options.source&&input.content){const {unified:_managed,...legacyFields}=parsed.data;provenance.legacyFields=legacyFields;}
            this._archive(state,fact,writes,'provenance');
            const content=renderFact({content:fact.content,type:fact.type,provenance,unified:{sources:Array.isArray(parsed.data.unified?.sources)?parsed.data.unified.sources:[]}});
            const updated={path:fact.path,content,revision:hash(content),...parseFact(content)};
            writes[fact.path]=content;facts[facts.findIndex(x=>x.path===fact.path)]=updated;state.facts[fact.path]={revision:updated.revision};fact=updated;
          }
          return {status:'duplicate',...(semantic?{semantic:true}:{}),path:fact.path,revision:fact.revision};
        };
        if(exact&&!(input.expectedRevision!==undefined&&existing)){results.push(duplicate(exact));continue;}
        const near=facts.map(f=>({fact:f,score:similarity(f.body,parsed.body)})).filter(x=>!x.fact.data.unified?.supersededBy).sort((a,b)=>b.score-a.score)[0];
        const signature=semanticSignature(parsed.body);const topical=signature&&facts.find(f=>{const s=semanticSignature(f.body);return s&&s.topic===signature.topic&&!f.data.unified?.supersededBy;});
        const chosen=input.relatedPath&&facts.find(f=>f.path===input.relatedPath),chosenSignature=chosen&&semanticSignature(chosen.body);const polarityConflict=signature&&chosenSignature&&signature.topic===chosenSignature.topic&&signature.value!==chosenSignature.value;
        const equivalent=input.relation==='equivalent'&&input.relatedPath&&!polarityConflict?facts.find(f=>f.path===input.relatedPath):topical&&semanticSignature(topical.body).value===signature.value?topical:near&&semanticText(near.fact.body)===semanticText(parsed.body)?near.fact:null;
        if(equivalent&&input.relation!=='supersedes'&&!(input.expectedRevision&&existing)){results.push(duplicate(equivalent,true));continue;}
        const related=input.relatedPath?facts.find(x=>x.path===relativeFile(this.root,input.relatedPath).rel):existing??topical;
        const protectedManual=options.origin==='extracted'&&(related??existing)&&((related??existing).data.unified?.sourceKind!=='extracted');
        const authorizedUpdate=!protectedManual&&(input.relation==='supersedes'&&related&&input.expectedRelatedRevision===related.revision||existing&&input.expectedRevision===existing.revision);
        let actualTarget=target,conflictWith;
        if((existing&&!authorizedUpdate)||protectedManual||(input.relation==='conflicts'&&related)||(topical&&semanticSignature(topical.body).value!==signature.value&&!authorizedUpdate)||near&&near.score>=0.78&&!authorizedUpdate){conflictWith=related?.path??near?.fact.path??existing.path;actualTarget=target.replace(/\.md$/u,`-conflict-${parsed.hash.slice(0,8)}.md`);state.stats.conflicts++;}
        const sameTarget=facts.find(x=>x.path===actualTarget);if(sameTarget&&!authorizedUpdate){if(sameTarget.hash===parsed.hash){results.push({status:'duplicate',path:actualTarget});continue;}throw fail('CONFLICT','Conflict filename already exists');}
        if(sameTarget)this._archive(state,sameTarget,writes,'update');
        const provenance=this._provenance(options);
        const prior=authorizedUpdate&&sameTarget?sameTarget:undefined;
        const base=prior&&input.content!==undefined?mergeFactContent(prior.content,input.content):input.content??prior?.content;
        const description=input.description??parsed.data.description??(prior&&prior.body!==parsed.body?parsed.body.replace(/\s+/gu,' ').slice(0,160):undefined);
        const content=renderFact({content:base,body:parsed.body,type:input.type??parsed.data.metadata?.type??parsed.data.type??prior?.type??parsed.type,name:input.name??parsed.data.name??prior?.data.name??slug(actualTarget.slice(0,-3)),description,provenance,unified:{sourceKind:provenance.kind,...(input.importKey?{importKey:input.importKey}:{}),importance:Math.min(1,Math.max(0,Number(input.importance??parsed.data.unified?.importance??prior?.data.unified?.importance??0.5))),...(conflictWith?{conflictWith}:{conflictWith:undefined}),...(input.relation==='supersedes'&&related&&authorizedUpdate?{supersedes:related.path}:{})}});
        const fact={path:actualTarget,content,revision:hash(content),...parseFact(content)};
        writes[actualTarget]=content;state.facts[actualTarget]={revision:fact.revision};const pos=facts.findIndex(x=>x.path===actualTarget);if(pos<0)facts.push(fact);else facts[pos]=fact;
        if(input.relation==='supersedes'&&related&&related.path!==actualTarget&&authorizedUpdate){this._archive(state,related,writes,'superseded');const marked=renderFact({content:related.content,type:related.type,provenance,unified:{supersededBy:actualTarget}});writes[related.path]=marked;const updated={path:related.path,content:marked,revision:hash(marked),...parseFact(marked)};facts[facts.findIndex(x=>x.path===related.path)]=updated;state.facts[related.path]={revision:updated.revision};}
        state.stats.saved++;results.push({status:conflictWith?'conflict':existing?'updated':'saved',path:actualTarget,revision:fact.revision,...(conflictWith?{conflictWith}:{})});
      }
      if(options.checkpoint)state.checkpoints[options.checkpoint.key]=options.checkpoint.value;
      if(options.stats)for(const [k,v] of Object.entries(options.stats))state.stats[k]=(state.stats[k]??0)+v;
      const result={results,generation:state.generation+1};if(opId){Object.defineProperty(state.operations,opId,{value:result,enumerable:true,writable:true,configurable:true});const ids=Object.keys(state.operations);for(const id of ids.slice(0,Math.max(0,ids.length-2000)))delete state.operations[id];}
      await this._commit(state,facts,writes,options);return result;
    },options);
  }
  async writeRaw(name,content,options={}) {const rel=relativeFile(this.root,name).rel;if(rel==='MEMORY.md'){await this.apply([],options);return this.read(rel);}
    const result=await this.save({path:rel,content,...(options.expectedRevision!==undefined?{expectedRevision:options.expectedRevision}:{})},options);
    if(result.path!==rel)throw fail(result.status==='duplicate'?'DUPLICATE_MEMORY':'MEMORY_CONFLICT',`Use existing memory ${result.path}`);return this.read(result.path);
  }
  async forget(name,options={}) {return this.apply([{action:'forget',path:name,purge:options.purge===true,expectedRevision:options.expectedRevision}],options).then(r=>r.results[0]);}
  async repair(name,{action,...options}={}){relativeFile(this.root,name);if(action==='detach')return this.apply([{action:'detach',path:name}],options);if(action!=='reimport')throw fail('INVALID_ARGUMENT','repair action must be reimport or detach');const r=await readSafe(this.root,name);assertSafe(r.content);parseFact(r.content);return this.apply([{action:'save',path:name,content:r.content,externalRevision:r.revision,expectedRevision:r.revision}],{...options,origin:'imported'});}
  async restore(archiveId,options={}) {if(!/^[a-f0-9-]{36}$/u.test(archiveId))throw fail('INVALID_ARCHIVE','Invalid archive id');const snap=await this.snapshot(options);const entry=snap.archives[archiveId];if(!entry)throw fail('NOT_FOUND','Archive not found');const archived=await readSafe(this.root,`.unified/archive/${archiveId}.md`,{internal:true});return this.save({path:entry.path,content:archived.content,...(options.expectedRevision!==undefined?{expectedRevision:options.expectedRevision}:{})},options);}
  async configure(patch,options={}) {
    for(const[k,v]of Object.entries(patch))if(!['autoExtract','modelEnabled','recall','extraction'].includes(k)||['autoExtract','modelEnabled'].includes(k)&&typeof v!=='boolean')throw fail('INVALID_SETTINGS','Invalid settings patch');
    if(patch.recall)for(const[k,v]of Object.entries(patch.recall)){
      if(k==='semantic'){if(!v||typeof v!=='object'||Array.isArray(v))throw fail('INVALID_SETTINGS','Invalid semantic settings');for(const[key,n]of Object.entries(v)){if(key==='enabled'){if(typeof n!=='boolean')throw fail('INVALID_SETTINGS','enabled must be boolean');}else if(key==='minRelevance'){if(!Number.isFinite(n)||n<0||n>1)throw fail('INVALID_SETTINGS','Invalid threshold');}else if(!['maxCandidates','maxInputChars','maxOutputTokens','timeoutMs'].includes(key)||!Number.isInteger(n)||n<0||n>1000000)throw fail('INVALID_SETTINGS','Invalid semantic budget');}}
      else if(!['maxChars','maxItems','maxTokens','maxSessionChars','maxSessionTokens'].includes(k)||!Number.isInteger(v)||v<0||v>1000000)throw fail('INVALID_SETTINGS','Invalid recall budget');
    }
    if(patch.extraction)for(const[k,v]of Object.entries(patch.extraction))if(!['maxInputChars','maxExistingChars','maxFacts','maxModelCalls'].includes(k)||!Number.isInteger(v)||v<0||v>1000000||k==='maxFacts'&&v>50||k==='maxModelCalls'&&v>1)throw fail('INVALID_SETTINGS','Invalid extraction budget');
    return this._access(true,async(state,facts)=>{state.settings=mergeSettings(state.settings,patch);const old=state.explicitSettings??{};state.explicitSettings={...old,...patch};if(patch.recall)state.explicitSettings.recall={...old.recall,...patch.recall,...(patch.recall.semantic?{semantic:{...old.recall?.semantic,...patch.recall.semantic}}:{})};if(patch.extraction)state.explicitSettings.extraction={...old.extraction,...patch.extraction};await this._commit(state,facts,{},options);return state.settings;},{...options,metadataOnly:true});
  }
  async recordStats(patch,{signal}={}){abort(signal);const stats=pendingStats.get(this.root)??{};for(const[k,v]of Object.entries(patch))if(Number.isFinite(v))stats[k]=(stats[k]??0)+v;pendingStats.set(this.root,stats);return {status:'buffered',durability:'flushed with next mutation; process-local otherwise'};}
  async observe(event,detail={}){if(this.readOnly)return;const rel=`.unified/events/${hash(event).slice(0,24)}.json`;let temp;try{await plainPath(path.join(this.root,'.unified/events'),{create:true});temp=path.join(this.root,`.unified/events/.event-${randomUUID()}.tmp`);await fs.writeFile(temp,JSON.stringify({event,at:this.now(),...detail}),{flag:'wx',mode:0o600});const target=relativeFile(this.root,rel,{internal:true}).full;await plainPath(path.dirname(target));const old=await exists(target);if(old?.isSymbolicLink())return;await fs.rename(temp,target);}catch{/* Observability is best effort; a read must not fail because telemetry is unwritable. */}finally{if(temp)await fs.unlink(temp).catch(()=>{});}}
  async observations(){const result={};try{const dir=path.join(this.root,'.unified/events');await plainPath(dir);const files=(await fs.readdir(dir)).filter(f=>/^[a-f0-9]{24}\.json$/u.test(f));for(const name of files.slice(-512)){try{const value=JSON.parse((await readSafe(this.root,`.unified/events/${name}`,{internal:true,maxBytes:4096})).content);if(!result[value.event]||result[value.event].at<value.at)result[value.event]=value;}catch{}}}catch{}return result;}
  async resetInjection(session,options={}){const key=`inject:${hash(session)}`;return this._access(true,async(state,facts)=>{const prior=state.checkpoints[key];if(options.compactionId&&prior?.compactionId===options.compactionId)return {status:'already-reset'};state.checkpoints[key]={version:2,seen:{},indexSeen:{},queries:{},chars:0,tokens:0,at:this.now(),compactionId:options.compactionId??null};await this._commit(state,facts,{},options);return {status:'reset'};},{...options,metadataOnly:true});}
  async claimInjection(session,fingerprints,chars,tokens,limits,options={}){const key=`inject:${hash(session)}`;return this._access(true,async(state,facts)=>{const prior=state.checkpoints[key]??{},old=prior.version===2?prior:{...prior,seen:{},indexSeen:prior.seen??{}},seen={...old.seen},indexSeen={...old.indexSeen};const indexes=options.indexFingerprints??[];if(fingerprints.some(f=>seen[f])||indexes.some(f=>indexSeen[f])||(old.chars??0)+chars>limits.maxSessionChars||(old.tokens??0)+tokens>limits.maxSessionTokens)return false;for(const f of fingerprints)seen[f]=true;for(const f of indexes)indexSeen[f]=true;state.checkpoints[key]={version:2,compactionId:old.compactionId??null,queries:Object.fromEntries(Object.entries({...old.queries,[options.queryKey??'unknown']:true}).slice(-128)),seen:Object.fromEntries(Object.entries(seen).slice(-2048)),indexSeen:Object.fromEntries(Object.entries(indexSeen).slice(-2048)),chars:(old.chars??0)+chars,tokens:(old.tokens??0)+tokens,at:this.now()};const keys=Object.keys(state.checkpoints).filter(k=>k.startsWith('inject:'));for(const k of keys.slice(0,-128))delete state.checkpoints[k];await this._commit(state,facts,{},options);return true;},{...options,metadataOnly:true});}
  async export(options={}){const snap=await this.snapshot(options);return {format:'zcode-memory-exchange',version:1,host:this.host,project:this.project,scope:this.scope,agent:this.agent??null,generation:snap.generation,facts:snap.facts.map(f=>({path:f.path,content:f.content,revision:f.revision})),skipped:snap.issues,settings:snap.settings};}
}
module.exports={MemoryStore,acquire,atomicText,markdownFiles,emptyState,mergeSettings};
