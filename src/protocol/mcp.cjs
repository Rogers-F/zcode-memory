'use strict';
const {createInterface}=require('node:readline');const {tools}=require('./service.cjs');
function serveMcp(service,{input=process.stdin,output=process.stdout}={}) {
  if(service.options.host==='kimi-cli')service=require('./kimi-mcp.cjs').kimiMcp(service);
  const running=new Map();const line=createInterface({input,crlfDelay:Infinity});const send=msg=>output.write(JSON.stringify(msg)+'\n');
  async function dispatch(msg) {
    if(msg.method==='notifications/cancelled'){running.get(msg.params?.requestId)?.abort();return;}
    if(msg.id===undefined)return;const controller=new AbortController();running.set(msg.id,controller);
    try {let result;
      if(msg.method==='initialize')result={protocolVersion:['2024-11-05','2025-03-26','2025-06-18'].includes(msg.params?.protocolVersion)?msg.params.protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false},resources:{}},serverInfo:{name:'zcode-memory',version:require('../version.cjs')},instructions:'Local memory is host-isolated. Automatic extraction and external models require explicit enablement. Kimi MCP tools require the absolute current session project argument.'};
      else if(msg.method==='ping')result={};
      else if(msg.method==='tools/list')result={tools:service.tools??tools};
      else if(msg.method==='resources/list')result={resources:[]};
      else if(msg.method==='resources/templates/list')result={resourceTemplates:[]};
      else if(msg.method==='tools/call'){try{const value=await service.tool(msg.params?.name,msg.params?.arguments??{},{signal:controller.signal});result={content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value&&typeof value==='object'?value:{value},isError:false};}catch(error){result={content:[{type:'text',text:JSON.stringify({error:error.code??error.name,message:error.message})}],isError:true};}}
      else {send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});return;}
      send({jsonrpc:'2.0',id:msg.id,result});
    }catch(error){send({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:error.message}});}finally{running.delete(msg.id);}
  }
  line.on('line',text=>{if(Buffer.byteLength(text)>1024*1024){send({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request exceeds 1 MiB'}});return;}try{const msg=JSON.parse(text);if(msg.jsonrpc!=='2.0'||typeof msg.method!=='string')throw new Error();void dispatch(msg);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON-RPC request'}});}});
  line.on('close',()=>{for(const c of running.values())c.abort();void service.close();});return {close(){line.close();},dispatch};
}
module.exports={serveMcp};
