// Apache-2.0. DSH owner-protected exact routes with HTTP and generic Connection RPC faces.
// Both carriers dispatch the SAME business handler. No independent server or authentication bypass.
const PREFIX='/api/zcode-memory-unified/';
const MAX_RPC_BODY_BYTES=8192;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function installMemoryRoutes(ctx,controller){
  for(const endpoint of ['settings','workspaces','file']){
    // The shared /api carrier enforces owner authentication BEFORE dispatching
    // either legacy HTTP or RPC-envelope POST requests, including native clients.
    ctx.connection.fetch.register({
      path:PREFIX+endpoint,methods:['GET','POST'],requestBody:'buffered',
      fetch:request=>handleMemoryRequest(request,controller),
    });
  }
}
function failure(error){
  const code=error instanceof SyntaxError?'INVALID_SETTINGS':error.code??'MEMORY_IO_ERROR';
  const status=code==='FILE_TOO_LARGE'?413:code==='FILE_NOT_FOUND'||code==='ENOENT'?404:code==='FILE_CHANGED'?409:['INVALID_PATH','INVALID_SETTINGS','INVALID_RPC'].includes(code)?400:500;
  const messages={FILE_TOO_LARGE:'The memory file exceeds the 5 MiB preview limit.',FILE_CHANGED:'The file changed while being read. Refresh and try again.',FILE_NOT_FOUND:'The memory file was deleted.',ENOENT:'The memory file was deleted.',INVALID_PATH:'Invalid memory path.',INVALID_SETTINGS:'Invalid settings.',INVALID_RPC:'Invalid memory RPC request.',SETTINGS_UNAVAILABLE:'Persistent settings are unavailable.'};
  return json({error:{code:code==='ENOENT'?'FILE_NOT_FOUND':code,message:messages[code]??'Memory operation failed; check the host diagnostic log.'}},status);
}
const invalidRpc=rpcId=>json({type:'server-response',rpcId,result:{ok:false,error:{code:'INVALID_RPC',message:'Invalid memory RPC request.',details:{}}}});
async function handleMemoryRpc(request,controller,endpoint,envelope){
  const rpcId=typeof envelope.rpcId==='string'&&envelope.rpcId.length>0&&envelope.rpcId.length<=128?envelope.rpcId:null;
  if(!rpcId)return failure(Object.assign(new Error('Invalid RPC id'),{code:'INVALID_RPC'}));
  if(Object.keys(envelope).some(key=>!['type','rpcId','method','payload'].includes(key))||envelope.method!==`zcode-memory-unified/${endpoint}`||!record(envelope.payload))return invalidRpc(rpcId);
  const payload=envelope.payload;
  const keys=Object.keys(payload);
  const url=new URL(PREFIX+endpoint,request.url);
  const init={signal:request.signal};
  if(endpoint==='settings'){
    if(keys.length===0)init.method='GET';
    else if(keys.length===1&&keys[0]==='enabled'&&typeof payload.enabled==='boolean'){
      init.method='POST';init.headers={'content-type':'application/json'};init.body=JSON.stringify({enabled:payload.enabled});
    }else return invalidRpc(rpcId);
  }else if(endpoint==='workspaces'){
    if(keys.length!==0)return invalidRpc(rpcId);
    init.method='GET';
  }else if(endpoint==='file'){
    if(keys.length!==2||keys.some(key=>!['workspaceId','fileName'].includes(key))||typeof payload.workspaceId!=='string'||typeof payload.fileName!=='string')return invalidRpc(rpcId);
    init.method='GET';url.search=new URLSearchParams({workspaceId:payload.workspaceId,fileName:payload.fileName}).toString();
  }else return invalidRpc(rpcId);
  // Internal Request conversion only: never fetch another URL or change Peer.
  const response=await handleMemoryRequest(new Request(url,init),controller);
  const data=await response.json();
  const result=response.ok?{ok:true,value:data}:{ok:false,error:{code:data.error?.code??'MEMORY_IO_ERROR',message:data.error?.message??'Memory operation failed.',details:{status:response.status}}};
  return json({type:'server-response',rpcId,result});
}
export async function handleMemoryRequest(request,controller){
  try{
    request.signal?.throwIfAborted();
    const url=new URL(request.url);
    const endpoint=url.pathname.slice(PREFIX.length);
    let input,body;
    if(request.method==='POST'){
      if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return json({error:{code:'INVALID_SETTINGS',message:'JSON body required'}},415);
      body=await request.text();
      if(Buffer.byteLength(body)>MAX_RPC_BODY_BYTES)throw Object.assign(new Error('Request body too large'),{code:'INVALID_RPC'});
      input=JSON.parse(body);
      if(record(input)&&input.type==='client-request')return await handleMemoryRpc(request,controller,endpoint,input);
    }
    if(endpoint==='settings'){
      if(request.method==='GET')return json(controller.getSettings());
      if(request.method!=='POST')return json({error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed'}},405);
      if(Buffer.byteLength(body)>1024||!record(input)||Object.keys(input).some(key=>key!=='enabled')||typeof input.enabled!=='boolean')throw Object.assign(new Error('Expected {enabled: boolean}'),{code:'INVALID_SETTINGS'});
      return json(await controller.setEnabled(input.enabled));
    }
    const settings=controller.getSettings();
    if(!settings.local)return json({error:{code:'LOCAL_ONLY',message:'Memory files are available on the local desktop only.'}},403);
    if(!settings.enabled)return json({error:{code:'MEMORY_DISABLED',message:'Enable Workspace Memory to view saved memories.'}},403);
    if(request.method!=='GET')return json({error:{code:'METHOD_NOT_ALLOWED',message:'Method not allowed'}},405);
    if(endpoint==='workspaces'){
      const workspaces=await controller.catalog.listWorkspaces({signal:request.signal});
      return json({workspaces:workspaces.map(w=>({id:w.id,label:w.label,updatedAt:w.updatedAt,files:w.files.map(f=>({name:f.name,kind:f.kind,size:f.size,updatedAt:f.updatedAt}))}))});
    }
    if(endpoint==='file')return json(await controller.catalog.readFile(url.searchParams.get('workspaceId')??'',url.searchParams.get('fileName')??'',{signal:request.signal}));
    return json({error:{code:'NOT_FOUND',message:'Not found'}},404);
  }catch(error){return failure(error);}
}
