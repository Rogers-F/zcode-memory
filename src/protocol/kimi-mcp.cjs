'use strict';
const path=require('node:path');
const {HostMemory,tools}=require('./service.cjs');
const {fail}=require('../core/index.cjs');
// Plugin stdio runs in the installed plugin directory, not the session project.
// Never infer a workspace from the plugin root or a shared "last session" file.
function kimiMcp(service){
  const projects=new Map();
  const scopedTools=tools.map(tool=>({...tool,inputSchema:{...tool.inputSchema,properties:{...tool.inputSchema.properties,project:{type:'string',description:'Absolute current session workspace path, required because plugin stdio cwd is the plugin root.'}},required:[...tool.inputSchema.required,'project']}}));
  return {tools:scopedTools,async tool(name,args={},options={}){
    const {project,...input}=args;
    if(typeof project!=='string'||!path.isAbsolute(project))throw fail('INVALID_PROJECT','Kimi MCP requires the absolute current session project argument');
    const key=path.resolve(project);
    if(!projects.has(key)){if(projects.size>=128)throw fail('PROJECT_LIMIT','Restart the MCP server before opening more than 128 projects');projects.set(key,new HostMemory({...service.options,project:key}));}
    return projects.get(key).tool(name,input,options);
  },async close(){await Promise.all([service.close(),...[...projects.values()].map(s=>s.close())]);}};
}
module.exports={kimiMcp};
