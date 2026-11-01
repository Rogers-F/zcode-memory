'use strict';
// Git marketplace installs do not run npm. The checked-in, ISC-licensed copy
// keeps that formal source install offline; normal packages use their dependency.
let YAML;try{YAML=require('yaml');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;YAML=require('../../vendor/yaml/lib/index.js');}
const {hash,normalize,truncate}=require('./text.cjs');
const TYPES=['user','feedback','project','reference'];
function parseFact(content) {
  const match=/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(String(content));
  let document=YAML.parseDocument(match?match[1]:'',{uniqueKeys:true});
  if(document.errors.length)throw Object.assign(new Error('Invalid memory frontmatter'),{code:'INVALID_FRONTMATTER'});
  const data=document.toJS({maxAliasCount:32})??{};
  if(typeof data!=='object'||Array.isArray(data))throw Object.assign(new Error('Frontmatter must be a mapping'),{code:'INVALID_FRONTMATTER'});
  const body=String(content).slice(match?.[0].length??0).trim();
  return {document,data,body,type:data.metadata?.type??data.type??'project',hash:hash(normalize(body))};
}
function renderFact({content,body,type='project',name,description,provenance,unified={}}) {
  const parsed=content!==undefined?parseFact(content):parseFact(String(body??''));
  const doc=parsed.document;
  if(!TYPES.includes(type))throw Object.assign(new Error('Unsupported memory type'),{code:'INVALID_TYPE'});
  if(name!==undefined||!doc.has('name'))doc.set('name',name??'memory');
  if(description!==undefined||!doc.has('description'))doc.set('description',description??truncate(parsed.body.replace(/\s+/gu,' '),160));
  if(!doc.has('metadata'))doc.set('metadata',doc.createNode({}));
  const metadata=doc.get('metadata',true);
  if(!YAML.isMap(metadata))throw Object.assign(new Error('metadata must be a mapping'),{code:'INVALID_FRONTMATTER'});
  metadata.set('type',type);
  if(!metadata.has('node_type'))metadata.set('node_type','memory');
  if(!metadata.has('originSessionId'))metadata.set('originSessionId',provenance.session);
  const previous=parsed.data.unified??{};
  doc.set('unified',{...previous,...unified,version:1,host:provenance.host,scope:provenance.scope,agent:provenance.agent??null,project:provenance.project,createdAt:previous.createdAt??provenance.at,updatedAt:provenance.at,sources:[...(Array.isArray(previous.sources)?previous.sources:[]),...(unified.sources??[]),provenance].filter((x,i,a)=>a.findIndex(y=>y.host===x.host&&y.session===x.session&&y.operation===x.operation)===i)});
  return `---\n${doc.toString({lineWidth:0}).trimEnd()}\n---\n\n${body!==undefined?String(body).trim():parsed.body}\n`;
}
function mergeFactContent(previous,incoming){
  const before=parseFact(previous),after=parseFact(incoming),doc=before.document;
  if(!YAML.isMap(after.document.contents))return previous;
  function merge(target,source,trail=[]){
    for(const pair of source.items){
      const key=String(pair.key?.value??pair.key);
      if(trail.length===0&&key==='unified'||trail.join('.')==='metadata'&&key==='originSessionId'&&target.has(key))continue;
      const old=target.get(key,true);
      if(YAML.isMap(old)&&YAML.isMap(pair.value))merge(old,pair.value,[...trail,key]);
      else target.set(key,pair.value?.clone?.()??pair.value);
    }
  }
  if(!YAML.isMap(doc.contents))doc.contents=doc.createNode({});
  merge(doc.contents,after.document.contents);
  return `---\n${doc.toString({lineWidth:0}).trimEnd()}\n---\n\n${after.body}\n`;
}
function indexText(facts) {
  const entries=facts.filter(x=>!x.data.unified?.supersededBy&&!x.data.unified?.conflictWith).sort((a,b)=>a.path.localeCompare(b.path)).map(x=>`- [${String(x.data.name??x.path).replace(/[\[\]\r\n]/gu,' ')}](${x.path.split('/').map(encodeURIComponent).join('/')}) — ${truncate(String(x.data.description??'').replace(/[\r\n]/g,' '),160)}`);
  const chosen=[];let size=0;
  for(const entry of entries){if(chosen.length>=200||size+entry.length+1>25000)break;chosen.push(entry);size+=entry.length+1;}
  return {content:chosen.join('\n')+(chosen.length?'\n':''),total:entries.length,omitted:entries.length-chosen.length};
}
module.exports={TYPES,parseFact,renderFact,mergeFactContent,indexText};
