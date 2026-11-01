// DSH Adapter for the ZCode Memory model seam. Apache-2.0; new adaptation, 2026.
import { BlockAssembler, createMessage, createUserMessage, createSystemMessage, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { appendPluginRecord } from '@deepseek-ai/dsh-session';

const textBlocks = value => typeof value === 'string' ? [{ type: 'text', text: value }] : (value ?? []);
export function toDshMessage(message, route) {
  // Preserve already canonical immutable DSH messages, including media and replay state.
  if (message.id && message.source && !message.toolCalls) return message;
  const blocks = textBlocks(message.content);
  if (message.role === 'system') return createSystemMessage(blocks.filter(x=>x.type==='text').map(x=>x.text).join('\n'));
  if (message.role === 'assistant') return createAssistantMessage({
    source: route,
    content: [...blocks, ...(message.toolCalls ?? []).map(call => ({type:'tool-call',id:call.id,name:call.name,arguments:JSON.stringify(call.input ?? {})}))],
  });
  if (message.role === 'tool') return createToolResultMessage({callId:message.toolCallId,content:blocks,isError:message.isError===true});
  if (message.role === 'developer') return createMessage({role:'developer',content:blocks,source:{kind:'zcode-memory-unified'}});
  return createUserMessage({content:blocks,source:{kind:'zcode-memory-unified-extraction'}});
}

export function recordMemoryEvent(session, kind, data) {
  // This is durable audit data only; it does NOT enter foreground model history.
  return appendPluginRecord(session, `plugin:dsh-zcode-memory-unified/${kind}`, JSON.parse(JSON.stringify(data)));
}

export function createDshMemoryModel({ctx,session,config,store,toolHistory=session.toolHistory?.(),isClosed=()=>false,operation='extraction',countStats=true}) {
  const route = {provider:config.provider,model:config.model};
  return {
    properties:{supportsJsonSchemaOutput:false,inputFormat:['text','image']},
    async generateText(request) {
      const signal = request.abortSignal;
      signal?.throwIfAborted();
      if (isClosed()) throw new DOMException('Memory session closed','AbortError');
      if (request.responseJsonSchema) {
        throw new Error('DSH 0.2.1 has no public native structured-output contract; dormant semantic selector cannot be enabled through this Adapter.');
      }
      if(countStats)await store?.recordStats({modelCalls:1},{signal});
      const prepared = await ctx.llm.prepareCall(config, signal, (controls, info) => {
        const next={...controls};
        const effort=info.reasoning?.efforts?.[0];
        if(effort) next.reasoningEffort=effort.id;
        const requested=request.options?.maxOutputTokens??request.options?.maxTokens;
        if(requested)next.maxTokens=Math.min(requested,info.maxTokens??requested);
        return next;
      });
      signal?.throwIfAborted();
      if(isClosed()) throw new DOMException('Memory session closed','AbortError');
      const messages=request.messages.map(message=>toDshMessage(message,route));
      const tools=(request.tools??[]).map(tool=>{
        const {semanticName,inputSchema,normalizeInput,sideEffectScope,...wire}=tool;
        return {...wire,description:wire.description??'',parameters:wire.parameters??inputSchema??{type:'object'}};
      });
      recordMemoryEvent(session,'request',{operation,config:prepared.config,messages,tools,...(toolHistory?{toolHistory}:{})});
      const accumulator=new BlockAssembler();
      for await (const chunk of prepared.stream({...prepared.config,messages,...(tools.length?{tools}:{}),...(toolHistory?{toolHistory}:{}),signal})) {
        signal?.throwIfAborted();
        if(isClosed()) throw new DOMException('Memory session closed','AbortError');
        accumulator.push(chunk);
      }
      signal?.throwIfAborted();
      if (accumulator.finish.kind==='error') throw Object.assign(new Error(accumulator.finish.failure?.message??'Memory model failed'),{code:accumulator.finish.failure?.code});
      if (accumulator.finish.kind==='aborted') throw new DOMException('Memory model aborted','AbortError');
      const blocks=accumulator.blocks();
      recordMemoryEvent(session,'response',{operation,content:blocks,usage:accumulator.usage??null,finish:accumulator.finish});
      return {
        assistantMessage:accumulator.message({...route,...(accumulator.replayState?{replayState:accumulator.replayState}:{})}),
        text:blocks.filter(x=>x.type==='text').map(x=>x.text).join(''),
        reasoning:blocks.filter(x=>x.type==='reasoning'),
        toolCalls:blocks.filter(x=>x.type==='tool-call').map(x=>({id:x.id,name:x.name,input:typeof x.arguments==='string'?JSON.parse(x.arguments):x.arguments})),
      };
    },
  };
}

// The host has a text completion API, not a native JSON-schema output API.
// Selection is parsed here and strictly validated by the shared core.
export function createDshRecallModel({ctx,session,agent,store,isClosed=()=>false}){
  const selected=()=>{const prior=session.requestHeader()?.config??{};return {...prior,provider:agent?.options?.provider??prior.provider,model:agent?.options?.model??prior.model};};
  return {get id(){const c=selected();return `dsh-host:${c.provider}:${c.model}`;},async recall(request){
    const config=selected();if(!config.provider||!config.model)throw Object.assign(new Error('No selected host model'),{code:'MODEL_UNAVAILABLE'});
    const model=createDshMemoryModel({ctx,session,config,store,isClosed,operation:'recall',toolHistory:null,countStats:false});
    const response=await model.generateText({messages:[{role:'system',content:request.system},{role:'user',content:JSON.stringify({version:1,query:request.query,candidates:request.candidates,limits:request.limits})}],tools:[],abortSignal:request.signal,options:{maxOutputTokens:request.limits.maxOutputTokens}});
    return JSON.parse(response.text);
  }};
}

export function sourceMessages(messages, tools) {
  const aliases = new Map(tools.map(t=>[t.name,t.semanticName??t.name]));
  return messages.filter(m=>m.role!=='system'&&m.role!=='developer').map(message=>({
    id:message.id,
    role:message.role,
    synthetic:message.role==='user'&&message.source?.kind!=='user',
    parts: textBlocks(message.content).flatMap(block=> {
      if(block.type==='text') return [{type:'text',text:block.text}];
      if(block.type==='tool-call') {
        let input;try{input=typeof block.arguments==='string'?JSON.parse(block.arguments):block.arguments;}catch{input={};}
        return [{type:'tool',tool:aliases.get(block.name)??block.name,state:{input}}];
      }
      return [];
    }),
  }));
}

export const semanticToolName = name => ({read:'Read',write:'Write',edit:'Edit',glob:'Glob',grep:'Grep',bash:'Bash',pwsh:'Bash',subagent:'Agent',spawn_teammate:'Agent'})[name]??name;
export function adaptPromptTools(text,tools) {
  const names=new Set(tools.map(t=>t.name));
  let result=text;
  for (const [upper,lower] of [['Read','read'],['Write','write'],['Edit','edit'],['Grep','grep'],['Glob','glob']]) if(names.has(lower)) result=result.replace(new RegExp(`\\b${upper}\\b`,'g'),lower);
  if(!names.has('bash')&&names.has('pwsh')) result += '\n\nDSH Windows Adapter: the actual shell tool is pwsh. Background memory work accepts only single literal-path Get-Content, Get-ChildItem, Get-Item, Test-Path, and Remove-Item -LiteralPath commands (no script, pipeline, redirect, recursion, or wildcards). Prefer read/write/edit tools. To forget a fact, remove its .md with Remove-Item -LiteralPath and update MEMORY.md with edit.';
  return result;
}
