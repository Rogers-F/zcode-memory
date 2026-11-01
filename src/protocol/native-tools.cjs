'use strict';
const {tools}=require('./service.cjs');
function attachNativeTools(api,getService) {
  if(typeof api.registerTool!=='function')return false;
  for(const tool of tools)api.registerTool({name:tool.name,label:tool.name,description:tool.description,parameters:tool.inputSchema,annotations:tool.annotations,async execute(_id,args,signal,_update,ctx){const service=getService(ctx);const value=await service.tool(tool.name,args,{signal,session:ctx?.sessionManager?.getSessionId?.()??'native'});return {content:[{type:'text',text:JSON.stringify(value)}],details:value};}});
  return true;
}
module.exports={attachNativeTools};
