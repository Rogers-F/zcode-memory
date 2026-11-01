// Unified adaptation: tools still enter the native DSH registry and its guards.
import {defineTool} from '@deepseek-ai/dsh-tools';
import unified from '../../shared.cjs';
function propertySpec(schema,required=false){const {required:keys,minimum,maximum,...value}=schema;if(value.properties)value.properties=Object.fromEntries(Object.entries(value.properties).map(([k,v])=>[k,propertySpec(v,(keys??[]).includes(k))]));return {...value,...(required?{required:true}:{})};}
export function registerUnifiedTools(ctx,getState,storageRoot){
  const specs=unified.memoryTools;
  for(const tool of specs)ctx.tools.register(defineTool({name:tool.name,description:tool.description,parameters:Object.fromEntries(Object.entries(tool.inputSchema.properties).map(([key,value])=>[key,propertySpec(value,tool.inputSchema.required.includes(key))])),output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>tool.annotations.readOnlyHint,async execute(args,exec){
    const state=getState(exec.agent);if(!state?.enabled||state.closed||!state.storage)throw unified.fail('MEMORY_DISABLED','Enable workspace memory in DSH settings for a new session');
    exec.signal.throwIfAborted();const readOnly=ctx.get('sandboxPolicy')?.resolve({session:exec.agent.session})?.mode==='read-only';
    if(readOnly&&!tool.annotations.readOnlyHint)throw unified.fail('MEMORY_READ_ONLY','Memory writes respect the DSH read-only policy');
    const service=state.service??new unified.HostMemory({host:'dsh',home:storageRoot,project:state.workspaceRoot,root:state.storage.rootDir,readOnly,importRoots:[state.workspaceRoot]});
    try{
      unified.validate(tool.name,args);
      if(tool.name==='memory_settings'&&args.modelEnabled===false){
        if(args.autoExtract===true)throw unified.fail('HOST_NATIVE_MODEL_REQUIRED','DSH native extraction uses the selected host model. Disable automatic extraction or use the standalone local-rule extractor.');
        args={...args,autoExtract:false};
      }
      if(tool.name==='memory_settings'&&args.autoExtract!==undefined){
        const settings=ctx.get('settings');
        if(!settings)throw unified.fail('SETTINGS_UNAVAILABLE','The native DSH settings service is required to persist automatic extraction');
        await settings.update('zcode-memory-unified',{extractionEnabled:args.autoExtract});
        state.extractionEnabled=args.autoExtract;
        args={...args,modelEnabled:args.autoExtract};
      }
      if(tool.name==='memory_settings'&&args.recall?.semantic?.enabled!==undefined){const enabled=args.recall.semantic.enabled;const settings=ctx.get('settings');if(settings)await settings.update('zcode-memory-unified',{semanticRecallEnabled:enabled});service.options.semanticEnabled=enabled;}
      return await service.tool(tool.name,args,{signal:exec.signal,session:exec.agent.session.id});
    }finally{if(service!==state.service)await service.close();}
  }}));
}
