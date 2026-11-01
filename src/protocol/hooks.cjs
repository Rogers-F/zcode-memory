'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const {plainPath,fail,stableCandidate,hash,readSafe}=require('../core/index.cjs');
function transcriptMessages(text,host){const out=[];let index=0;for(const line of text.split('\n')){if(!line.trim())continue;let record;try{record=JSON.parse(line);}catch{continue;}const payload=record.payload??record;const message=record.message??payload.message??payload;let role=message?.role??record.type;let content=message?.content??(typeof message==='string'?message:payload.text);
    if(payload.type==='user_message'){role='user';content=payload.message;}if(record.type==='event_msg'&&payload.type!=='user_message')continue;if(Array.isArray(content)&&content.some(p=>['tool_result','tool_use','tool-call','tool-result'].includes(p.type)))continue;
    if(role!=='user'||record.isMeta||record.isCompactSummary||record.synthetic||record.metadata&&record.metadata.source&&record.metadata.source!=='real_user'||message.synthetic||message.source&&message.source.kind!=='user'||payload.source&&payload.source.kind!=='user'||['tool_result','web','compaction','summary'].includes(payload.type)||['summary','compaction','compacted','web','tool_result','function_call_output'].includes(record.type)||message.tool_call_id||message.toolCallId)continue;const body=typeof content==='string'?content:(Array.isArray(content)?content.filter(p=>['text','input_text'].includes(p.type)).map(p=>p.text??'').join('\n'):'');if(!body||body.includes('<zcode-memory-background>'))continue;
    out.push({id:record.uuid??record.id??payload.id??`${index++}:${hash(body).slice(0,12)}`,role:'user',text:body});}return out;}
async function handleHook(service,payload,{host=service.options.host,signal}={}) {
  const event=payload.hook_event_name??payload.event;const session=String(payload.session_id??payload.sessionId??'default');const store=await service.prepare();await service.event(`hook:${event}`,{status:payload.aborted?'aborted':'triggered'});
  if(['SessionStart','UserPromptSubmit'].includes(event)){
    if(event==='SessionStart'&&payload.source==='compact')await service.resetInjection(session,{signal,compactionId:payload.compaction_id??payload.event_id??payload.hook_id});
    const prompt=String(payload.prompt??payload.user_prompt??'');const snap=await store.catalog({signal});if(event==='UserPromptSubmit'&&snap.settings.autoExtract&&stableCandidate(prompt)){const key=`pending:${session}`,previous=snap.checkpoints[key]?.messages??[];await store.apply([],{signal,metadataOnly:true,checkpoint:{key,value:{messages:[...previous,{id:payload.turn_id??hash(prompt),role:'user',text:prompt.slice(0,12000)}].slice(-30)}}});}
    service.events[event]={at:new Date().toISOString(),status:'triggered'};const context=await service.injection({session,query:prompt,includeIndex:event==='SessionStart',signal});return {hookSpecificOutput:{hookEventName:event,additionalContext:context.text}};
  }
  if(['Stop','SessionEnd'].includes(event)&&!payload.stop_hook_active&&!payload.aborted&&!['aborted','interrupted','error'].includes(payload.reason)){
    const snap=await store.catalog({signal});if(!snap.settings.autoExtract)return {};
    let messages=snap.checkpoints[`pending:${session}`]?.messages??[];
    if(payload.transcript_path){
      const file=path.resolve(payload.transcript_path);
      if(!file.endsWith('.jsonl'))throw fail('UNSAFE_TRANSCRIPT','Transcript must be an explicit JSONL file');
      try{
        const text=(await readSafe(path.dirname(file),path.basename(file),{internal:true,maxBytes:8*1024*1024})).content;
        const parsed=transcriptMessages(text,host);if(parsed.length)messages=parsed;
      }catch(error){
        // Long or rotated transcripts use only stable prompts captured by our own hook.
        // Unsafe paths still fail closed and never fall back to another file.
        if(!['ENOENT','FILE_TOO_LARGE'].includes(error.code))throw error;
      }
    }
    if(messages.length)await service.completed({session,messages,outcome:'completed',boundary:payload.turn_id??messages.at(-1).id},{signal});
    await store.apply([],{signal,metadataOnly:true,checkpoint:{key:`pending:${session}`,value:{messages:[]}}});return {};
  }
  // Failure, interrupt and unsupported subagent events do not trigger extraction.
  return {};
}
module.exports={handleHook,transcriptMessages};
