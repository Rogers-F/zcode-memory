'use strict';
// No inherited credentials, workspace trust overrides or model prompts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,spawnSync}=require('node:child_process');
async function checkKimi(root,base){
 const work=path.join(base,'kimi');for(const n of ['home','config','tmp','project'])fs.mkdirSync(path.join(work,n),{recursive:true});
 const env={PATH:process.env.PATH,HOME:path.join(work,'home'),USERPROFILE:path.join(work,'home'),KIMI_CODE_HOME:path.join(work,'config'),TMPDIR:path.join(work,'tmp'),TMP:path.join(work,'tmp'),TEMP:path.join(work,'tmp'),ZCODE_MEMORY_HOME:path.join(work,'memory'),NO_COLOR:'1',LC_ALL:'C'};
 const executable=process.env.KIMI_CLI_EXECUTABLE??path.join(os.homedir(),'.kimi-code/bin/kimi');
 if(!fs.existsSync(executable))return {status:'unavailable',boundary:'No installed Kimi executable found; protocol/package checks still run'};
 const run=args=>spawnSync(executable,args,{cwd:path.join(work,'project'),env,encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
 const version=run(['--version']),help=run(['--help']);
 fs.writeFileSync(path.join(work,'version-help.log'),JSON.stringify({version,help},null,2));
 if(version.status!==0||help.status!==0)throw new Error('Kimi version/help failed in isolated HOME');
 const report={status:'version-help-checked',version:version.stdout.trim(),work,configHome:env.KIMI_CODE_HOME,modelCalls:0,hookTrustBypassed:false};
 const plugin=path.join(root,'dist/kimi-cli'),zip=path.join(root,'artifacts',`zcode-memory-kimi-cli-${require(path.join(root,'package.json')).version}.zip`);
 if(!fs.existsSync(path.join(plugin,'kimi.plugin.json'))||!fs.existsSync(zip))throw new Error('Build the Kimi plugin before native checking');
 const proc=spawn(executable,['acp'],{cwd:path.join(work,'project'),env,stdio:['pipe','pipe','pipe']});
 let buffer='',errors='',id=0;const waiting=new Map(),events=[];
 proc.stderr.on('data',b=>errors+=b);
 proc.stdout.on('data',b=>{buffer+=b;while(buffer.includes('\n')){const at=buffer.indexOf('\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+1);let msg;try{msg=JSON.parse(line);}catch{events.push({nonJson:line});continue;}
   if(msg.id!==undefined&&waiting.has(msg.id)){waiting.get(msg.id)(msg);waiting.delete(msg.id);}else if(msg.id!==undefined){events.push(msg);proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:msg.method==='session/request_permission'?{outcome:{outcome:'cancelled'}}:{}})+'\n');}else events.push(msg);
 }});
 const request=(method,params)=>new Promise((resolve,reject)=>{const next=++id,timer=setTimeout(()=>{waiting.delete(next);reject(new Error(`Kimi ${method} timeout`));},15000);waiting.set(next,msg=>{clearTimeout(timer);msg.error?reject(new Error(JSON.stringify(msg.error))):resolve(msg.result);});proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id:next,method,params})+'\n');});
 proc.on('error',error=>{errors+=error.message;});
 try{
   report.initialize=await request('initialize',{protocolVersion:1,clientInfo:{name:'zcode-memory-native-check',version:'0.2.0'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}});
   const session=await request('session/new',{cwd:path.join(work,'project'),mcpServers:[]});report.session=session;
   const commands=events.flatMap(e=>e.params?.update?.availableCommands??[]);
   if(!commands.some(c=>c.name==='plugins'))throw new Error('ACP did not advertise the plugins control command; no prompt submitted');
   // These are native control commands, never a natural-language model request.
   report.commands=[];
   for(const command of [`/plugins install ${plugin}`,'/plugins info zcode-memory']){
     const result=await request('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:command}]});report.commands.push({command,result});
   }
   report.status='native-plugin-control-commands-returned';
 }catch(error){report.status='native-plugin-check-unavailable';report.boundary=error.message;}
 finally{proc.stdin.end();proc.kill();fs.writeFileSync(path.join(work,'acp-events.json'),JSON.stringify(events,null,2));fs.writeFileSync(path.join(work,'stderr.log'),errors);}
 report.eventsFile=path.relative(root,path.join(work,'acp-events.json'));report.boundary=report.boundary??'Control commands only; native model hook execution, permissions UI, reload/compaction delivery not exercised';
 fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));return report;
}
module.exports={checkKimi};
