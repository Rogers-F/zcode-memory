'use strict';
const path=require('node:path');const {HostMemory}=require('../../src/protocol/service.cjs');const {attachNativeTools}=require('../../src/protocol/native-tools.cjs');const {sourceText,hash,isUserMessage}=require('../../src/core/index.cjs');
module.exports=function memoryExtension(pi,options={}) {
  const services=new Map(),states=new Map(),jobs=new Set();let context;
  const session=ctx=>ctx?.sessionManager?.getSessionId?.()??'pi-session';
  const key=ctx=>JSON.stringify([ctx?.cwd??options.project??process.cwd(),session(ctx)]);
  function state(ctx){const id=key(ctx);if(!states.has(id))states.set(id,{pending:[],outcome:'completed',epoch:0});return states.get(id);}
  function getService(ctx){const id=key(ctx);if(!services.has(id))services.set(id,new HostMemory(Object.fromEntries(Object.entries({host:'pi-cli',home:options.home??process.env.ZCODE_MEMORY_HOME,project:ctx?.cwd??options.project??process.cwd(),readOnly:options.readOnly??process.env.ZCODE_MEMORY_READ_ONLY==='1',model:options.model}).filter(([,v])=>v!==undefined))));return services.get(id);}
  attachNativeTools(pi,getService);
  pi.on('session_start',async(_event,ctx)=>{context=ctx;const s=state(ctx);s.epoch++;s.pending=[];await getService(ctx).resetInjection(session(ctx));await getService(ctx).event('pi:session_start');});
  pi.on('before_agent_start',async(event,ctx)=>{context=ctx;if(event.messageType==='custom')return;const s=state(ctx),text=event.prompt??'';s.turn=(s.turn??0)+1;await getService(ctx).event('pi:before_agent_start');s.pending.push({id:hash(`${s.pending.length}:${text}`),role:'user',text});await getService(ctx).injection({session:session(ctx),query:text,turnId:`${s.epoch}:${s.turn}`});});
  pi.on('context',async(event,ctx)=>{
    ctx=ctx??context;if(!ctx)return undefined;
    // Pi calls before_agent_start before context. Replay is assembled here for
    // every model step, including tool continuations, and never enters history.
    const injected=await getService(ctx).injection({session:session(ctx),renderOnly:true});
    const messages=[...event.messages].filter(m=>!m.zcodeMemoryTransient);if(!injected.text)return {messages};
    let at=messages.length;for(let i=messages.length-1;i>=0;i--)if(messages[i].role==='user'){at=i;break;}
    messages.splice(at,0,{role:'user',content:[{type:'text',text:injected.text}],timestamp:0,zcodeMemoryTransient:true});return {messages};
  });
  pi.on('session_compact',async(_event,ctx)=>{const s=state(ctx);s.epoch++;await getService(ctx).resetInjection(session(ctx));await getService(ctx).event('pi:session_compact');});
  pi.on('agent_before_settle',(event,ctx)=>{state(ctx??context).outcome=event.outcome;});
  pi.on('agent_settled',async(event,ctx)=>{const s=state(ctx),service=getService(ctx);await service.event('pi:agent_settled',{status:event.aborted?'aborted':s.outcome});if(event.aborted||s.outcome!=='completed')return;const epoch=s.epoch;const entries=ctx.sessionManager?.getBranch?.()??[];const messages=entries.filter(e=>e.type==='message'&&isUserMessage(e.message)).map(e=>({id:e.id,role:'user',text:sourceText(e.message)})).filter(m=>!m.text.includes('<zcode-memory-background>'));const snapshot={session:session(ctx),messages:messages.length?messages:s.pending,outcome:'completed'};const job=service.completed(snapshot).catch(error=>{if(epoch===s.epoch&&ctx.hasUI)ctx.ui?.notify?.(`Memory: ${error.message}`,'warning');}).finally(()=>jobs.delete(job));jobs.add(job);await job;});
  pi.on('session_shutdown',async(_event,ctx)=>{ctx=ctx??context;const id=key(ctx);state(ctx).epoch++;await services.get(id)?.close();services.delete(id);states.delete(id);});
  pi.registerCommand?.('memory',{description:'Memory tools: list, save TEXT, recall QUERY, forget PATH, settings JSON, stats, dream',async handler(args,ctx){const [command='list',...rest]=String(args??'').split(' ');const text=rest.join(' ');const input=text.startsWith('{')?JSON.parse(text):command==='save'?{body:text}:command==='recall'?{query:text}:['forget','read'].includes(command)?{path:text}:{};const value=await getService(ctx).tool(`memory_${command}`,input);if(ctx.hasUI)ctx.ui?.notify?.(JSON.stringify(value),'info');return value;}});
  if((options.mcp??process.env.ZCODE_MEMORY_PI_MCP==='1')&&typeof pi.registerMcpServer==='function'){
    const home=options.home??process.env.ZCODE_MEMORY_HOME;
    pi.registerMcpServer('zcode_memory',{command:process.execPath,args:[path.resolve(__dirname,'../../bin/mcp.cjs'),'--host','pi-cli'],env:{...(home?{ZCODE_MEMORY_HOME:home}:{}),...((options.readOnly??process.env.ZCODE_MEMORY_READ_ONLY==='1')?{ZCODE_MEMORY_READ_ONLY:'1'}:{})}});
  }
  return {getService,async drain(){await Promise.all([...jobs]);},async close(){await Promise.all([...services.values()].map(service=>service.close()));services.clear();states.clear();}};
};
