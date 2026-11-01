'use strict';
const path=require('node:path');const fs=require('node:fs/promises');const {constants}=require('node:fs');
const {hash}=require('./text.cjs');
const fail=(code,message)=>Object.assign(new Error(message),{code});
const abort=signal=>signal?.throwIfAborted();
const HOSTS=['pi-desktop','dsh','claude-code','codex-cli','pi-cli'];
function slug(s){return String(s).normalize('NFKC').replace(/[^a-zA-Z0-9\p{Script=Han}_.-]+/gu,'-').replace(/^[-.]+|[-.]+$/g,'').slice(0,60)||'memory';}
function identity({project=process.cwd(),workspaceIdentity,platform=process.platform}) {const p=(platform==='win32'?path.win32:path).resolve(project);const key=workspaceIdentity?.trim()||(platform==='win32'?p.toLowerCase():p);return {path:p,key,id:`${workspaceIdentity?'project':slug(path.basename(p)).toLowerCase()}-${hash(key).slice(0,16)}`};}
function storePath({home,host,project,workspaceIdentity,scope='project',agent,agentScope='project'}) {
  if(!home||!HOSTS.includes(host))throw fail('INVALID_SCOPE','Explicit memory home and supported host required');
  const id=identity({project,workspaceIdentity});let suffix;
  if(scope==='personal')suffix=['personal','memory'];
  else if(scope==='project')suffix=['memories','projects',id.id,'memory'];
  else if(scope==='agent'&&agent&&['user','project','local'].includes(agentScope))suffix=['agents',agentScope,agentScope==='user'?'global':id.id,`${slug(agent)}-${hash(agent).slice(0,8)}`,'memory'];
  else throw fail('INVALID_SCOPE','scope must be personal/project/agent; agent scope needs an agent name');
  return {root:path.join(path.resolve(home),'hosts',host,...suffix),identity:id};
}
async function plainPath(target,{create=false}={}) {
  const absolute=path.resolve(target);const parts=absolute.slice(path.parse(absolute).root.length).split(path.sep).filter(Boolean);let cursor=path.parse(absolute).root;
  for(const part of parts){cursor=path.join(cursor,part);let stat;try{stat=await fs.lstat(cursor);}catch(e){if(e.code!=='ENOENT')throw e;if(!create)throw e;try{await fs.mkdir(cursor,{mode:0o700});}catch(m){if(m.code!=='EEXIST')throw m;}stat=await fs.lstat(cursor);}
    if(stat.isSymbolicLink())throw fail('UNSAFE_PATH','Symbolic links are not accepted');
    if(cursor!==absolute&&!stat.isDirectory())throw fail('UNSAFE_PATH','Non-directory path ancestor');
    const entries=await fs.readdir(path.dirname(cursor));if(!entries.includes(part)&&entries.some(x=>x.toLowerCase()===part.toLowerCase()))throw fail('UNSAFE_PATH','Path casing alias refused');
  }return absolute;
}
function relativeFile(root,name,{internal=false}={}) {
  if(typeof name!=='string'||!name||name.includes('\0')||name.includes('\\'))throw fail('UNSAFE_PATH','Invalid file path');
  let rel=path.isAbsolute(name)?path.relative(root,name):name;
  const parts=rel.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/u.test(p)||/[. ]$/u.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(p)))throw fail('UNSAFE_PATH','Unsafe memory path');
  if(!internal&&(parts.some(p=>p.startsWith('.')||['hooks','node_modules'].includes(p.toLowerCase()))||!rel.endsWith('.md')))throw fail('UNSAFE_PATH','Only ordinary Markdown memory paths are accepted');
  const full=path.resolve(root,...parts);if(!full.startsWith(path.resolve(root)+path.sep))throw fail('UNSAFE_PATH','Path escapes memory root');return {full,rel:parts.join('/')};
}
async function readSafe(root,name,{maxBytes=5*1024*1024,internal=false}={}) {
  const {full}=relativeFile(root,name,{internal});await plainPath(full);const handle=await fs.open(full,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try {const before=await handle.stat();if(!before.isFile()||before.size>maxBytes)throw fail('FILE_TOO_LARGE','Memory file exceeds limit');const bytes=await handle.readFile();const after=await handle.stat();if(bytes.length>maxBytes||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw fail('FILE_CHANGED','Memory changed during read');return {content:bytes.toString('utf8'),revision:hash(bytes.toString('utf8')),stat:after};}finally{await handle.close();}
}
module.exports={HOSTS,fail,abort,slug,identity,storePath,plainPath,relativeFile,readSafe};
