// Apache-2.0. DSH-specific scoped file tool Adapter, preserving existing policy stages.
import { resolve, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { memoryFileRelativePath } from '../storage.js';

/** Deliberately finite PowerShell subset, interpreted as data; never executes shell code. */
export function parseMemoryShell(command, {rootDir,workingDirectory}) {
  if(typeof command!=='string'||/[\r\n;|&<>`$(){}]/u.test(command)) return undefined;
  const tokens=command.match(/"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+/gu);
  if(!tokens?.length||tokens.join(' ').replace(/\s+/g,' ')!==command.trim().replace(/\s+/g,' ')) return undefined;
  const words=tokens.map(v=>(v[0]==='"'||v[0]==="'")?v.slice(1,-1):v);
  const name=words.shift().toLowerCase();
  const types={'get-content':'read','get-childitem':'list','get-item':'stat','test-path':'exists','remove-item':'remove','rm':'remove','cat':'read','ls':'list','stat':'stat'};
  const kind=Object.hasOwn(types,name)?types[name]:undefined; if(!kind)return undefined;
  const paths=[]; const allowed=new Set(['-literalpath','-path','-raw','--']);
  for(const word of words) {
    if(word.startsWith('-')) {if(!allowed.has(word.toLowerCase()))return undefined;continue;}
    if(/[\[\]*?,]/u.test(word)||!word||word.startsWith('@')) return undefined;
    paths.push(resolve(workingDirectory,word));
  }
  if(paths.length===0&&kind==='list')paths.push(rootDir);
  if(paths.length!==1&&kind!=='remove')return undefined;
  if(paths.length===0)return undefined;
  if(paths.some(p=>p!==rootDir&&!memoryFileRelativePath(rootDir,p))) return undefined;
  if(kind==='remove'&&paths.some(p=>!p.endsWith('.md')||!memoryFileRelativePath(rootDir,p)))return undefined;
  return {kind,paths};
}
function errorResult(error) {return {isError:true,error:{message:error.message,info:{code:error.code??'MEMORY_IO_ERROR'}},content:[{type:'text',text:`Error: ${error.message}`}]};}
function shellValue(text,cwd,args) {return {kind:'foreground',cwd,exitCode:0,signal:null,timedOut:false,aborted:false,timeoutMs:args.timeoutMs??120000,stdout:{text,truncated:false},stderr:{text:'',truncated:false}};}

export function createMemoryToolBridge({ctx,getState,onTool=()=>{}}) {
  const background=new Map();
  const detach=ctx.on('tools/execute',async(exec,next)=>{
    const bg=background.get(exec.callId);
    const state=getState(exec.agent);
    if(!state?.enabled||state.closed||!state.storage){
      if(bg)return errorResult(Object.assign(new Error('Background memory scope was closed'),{code:'MEMORY_TOOL_DENIED'}));
      return next();
    }
    const readState=bg?.readState??state.readState;
    const args=exec.arguments??{};
    const cwd=bg?.workingDirectory??ctx.get('workingDirectory')?.get(exec.agent.session)??state.workspaceRoot;
    const filePath=typeof args.file_path==='string'?resolve(cwd,args.file_path):undefined;
    const target=filePath&&memoryFileRelativePath(state.storage.rootDir,filePath)?filePath:undefined;
    const shellTool=exec.name==='pwsh'||exec.name==='bash';
    const shell=shellTool?parseMemoryShell(args.command,{rootDir:state.storage.rootDir,workingDirectory:args.workdir??cwd}):undefined;
    // Fail closed for all background PowerShell; an approved virtual command must never fall through to a real shell.
    if(bg&&exec.name==='pwsh'&&!shell)return errorResult(Object.assign(new Error('Background PowerShell command is outside the supported memory-only subset'),{code:'MEMORY_TOOL_DENIED'}));
    if(bg&&['write','edit','Write','Edit'].includes(exec.name)&&!target)return errorResult(Object.assign(new Error('Background mutations are restricted to the frozen memory root'),{code:'MEMORY_TOOL_DENIED'}));
    if(!target&&!shell)return next();
    if(!['read','write','edit','pwsh','bash','Read','Write','Edit'].includes(exec.name))return next();
    try {
      exec.signal.throwIfAborted();
      if(state.closed)throw new DOMException('Memory session closed','AbortError');
      const name=exec.name.toLowerCase();
      const mutation=name==='write'||name==='edit'||shell?.kind==='remove';
      const policy=ctx.get('sandboxPolicy')?.resolve({session:exec.agent.session});
      if(mutation&&policy?.mode==='read-only') throw Object.assign(new Error('Memory writes respect the DSH read-only policy.'),{code:'MEMORY_READ_ONLY'});
      let value;
      const options={readState,signal:exec.signal,sessionId:exec.agent.session.id,origin:bg?'extracted':'manual'};
      if(target&&name==='read'){
        // Keep the actual DSH reader's configured line/byte caps and policy; do not replace it with a 5MiB dump.
        const original=await next();
        if(original.isError)return original;
        const window=original.value;
        if(!window||!Array.isArray(window.lines)||typeof window.path!=='string')return original;
        const canonicalKey=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
        if(canonicalKey(window.path)!==canonicalKey(target))return original;
        const result=await state.storage.read(target,{...options,offset:window.offset,limit:Math.max(1,window.lines.length)});
        const fullLines=result.content.split('\n');
        const faithful=window.lines.every((line,i)=>line.text===fullLines[i]);
        // A cap-truncated line is not a complete read capability; preserve the original visible result.
        if(!faithful)for(const record of readState.values())if(record.path===result.path||record.filePath===result.path)record.isPartialView=true;
        return original;
      } else if(target&&(name==='write'||name==='edit')) {
        const result=name==='write'?await state.storage.write(target,args.content,options):await state.storage.edit(target,args.old_string,args.new_string,{...options,replaceAll:args.replace_all??false});
        value=name==='write'?{path:result.path,operation:result.operation,before:result.before,after:result.after}:{path:result.path,before:result.before,after:result.after};
      } else if(shell){
        let text='';
        if(shell.kind==='remove') {for(const p of shell.paths){exec.signal.throwIfAborted();await state.storage.remove(p,options);}text=`Removed ${shell.paths.length} memory file(s).`;}
        if(shell.kind==='read')text=(await state.storage.read(shell.paths[0],{signal:exec.signal})).content;
        if(shell.kind==='list')text=(await state.storage.list({signal:exec.signal})).map(x=>x.filename??x.name??x.filePath).join('\n');
        if(shell.kind==='exists'||shell.kind==='stat'){
          try{const result=await state.storage.read(shell.paths[0],{signal:exec.signal});text=shell.kind==='exists'?'True':JSON.stringify({path:result.path,size:result.sizeBytes,mtimeMs:result.mtimeMs});}
          catch(error){if(shell.kind==='exists'&&['ENOENT','FILE_NOT_FOUND'].includes(error.code))text='False';else throw error;}
        }
        value=shellValue(text,state.workspaceRoot,args);
      } else return next();
      exec.signal.throwIfAborted();
      await onTool(exec,value,bg!==undefined);
      return {isError:false,value,content:[]};
    }catch(error){return errorResult(error);}
  });
  return {
    detach,
    async execute(agent,call,{abortSignal,readState,workingDirectory}){
      abortSignal?.throwIfAborted();
      const state=getState(agent);
      if(!state||state.closed)throw new DOMException('Memory session closed','AbortError');
      const cwd=workingDirectory??state.workspaceRoot;
      const input=structuredClone(call.input??{});
      const reject=message=>({success:false,modelContent:`Error: ${message}`,error:{message,code:'MEMORY_TOOL_DENIED'}});
      const pathKey=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
      if(input.run_in_background===true)return reject('Background memory cannot detach shell jobs');
      if(input.workdir!==undefined&&(typeof input.workdir!=='string'||pathKey(resolve(cwd,input.workdir))!==pathKey(cwd)))return reject('Background memory cannot change the frozen execution directory');
      if(typeof input.file_path==='string')input.file_path=resolve(cwd,input.file_path);
      if(['glob','grep','Glob','Grep'].includes(call.name))input.path=resolve(cwd,input.path??'.');
      if(call.name==='pwsh'||call.name==='bash')input.workdir=cwd;
      const callId=`memory-${randomUUID()}`;
      background.set(callId,{readState,workingDirectory:cwd});
      try{
        const result=await ctx.tools.execute({agent,callId,name:call.name,arguments:input,signal:abortSignal});
        return {success:!result.isError,modelContent:result.content,output:result.value,error:result.error};
      }finally{background.delete(callId);}
    },
  };
}
