// Test-only provider: no HTTP, accounts or real model credentials.
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import fs from "node:fs";
export default function scriptedProvider(pi) {
  let calls=0,forgot=false;
  for(const name of ['before_agent_start','context','session_compact'])pi.on(name,(_event,ctx)=>{if(process.env.ZCODE_MEMORY_EVENTS_CAPTURE)fs.appendFileSync(process.env.ZCODE_MEMORY_EVENTS_CAPTURE,JSON.stringify({event:name,session:ctx.sessionManager.getSessionId()})+'\n');});
  pi.registerProvider('memory-scripted',{
    baseUrl:'https://unused.invalid',apiKey:'local-scripted-fixture',api:'memory-scripted-api',
    models:[{id:'controlled',name:'Controlled local model',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:1000}],
    streamSimple(model,context,options){
      const stream=createAssistantMessageEventStream();
      const message={role:'assistant',content:[],api:model.api,provider:model.provider,model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};
      queueMicrotask(()=>{
        try {
          if(process.env.ZCODE_MEMORY_CAPTURE)fs.appendFileSync(process.env.ZCODE_MEMORY_CAPTURE,JSON.stringify(context)+'\n');
          stream.push({type:'start',partial:message});
          const mode=process.env.ZCODE_MEMORY_SCRIPT_MODE??(process.env.ZCODE_MEMORY_SCRIPT_SAVE==='1'?'save':'none');
          const latest=context.messages.filter(m=>m.role==='user').at(-1),forgetNow=mode==='sticky-rpc'&&!forgot&&JSON.stringify(latest).includes('FORGET-NATIVE');
          if(forgetNow){forgot=true;calls++;const toolCall={type:'toolCall',id:'sticky-forget',name:'memory_forget',arguments:{path:'sticky-native.md'}};message.content.push(toolCall);message.stopReason='toolUse';stream.push({type:'toolcall_start',contentIndex:0,partial:message});stream.push({type:'toolcall_end',contentIndex:0,toolCall,partial:message});}
          else if(calls++===0&&['save','recall','forget'].includes(mode)){
            const definitions={save:{name:'memory_save',arguments:{path:'native-pi.md',body:'以后发布先经过 staging，再由负责人审批。',type:'project'}},recall:{name:'memory_recall',arguments:{query:'发布流程'}},forget:{name:'memory_forget',arguments:{path:'native-pi.md'}}};
            const toolCall={type:'toolCall',id:'fixture-'+mode,...definitions[mode]};
            message.content.push(toolCall);message.stopReason='toolUse';stream.push({type:'toolcall_start',contentIndex:0,partial:message});stream.push({type:'toolcall_end',contentIndex:0,toolCall,partial:message});
          }else {message.content.push({type:'text',text:'Local scripted completion.'});stream.push({type:'text_start',contentIndex:0,partial:message});stream.push({type:'text_delta',contentIndex:0,delta:'Local scripted completion.',partial:message});stream.push({type:'text_end',contentIndex:0,content:'Local scripted completion.',partial:message});}
          stream.push({type:'done',reason:message.stopReason,message});stream.end();
        }catch(error){message.stopReason='error';message.errorMessage=error.message;stream.push({type:'error',reason:'error',error:message});stream.end();}
      });return stream;
    }
  });
}
