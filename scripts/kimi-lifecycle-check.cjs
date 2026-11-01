'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {HostMemory}=require('../src/protocol/service.cjs');
async function checkKimiLifecycle(root,base){
 const work=path.join(base,'kimi-tui');for(const n of ['home','config','tmp','project'])fs.mkdirSync(path.join(work,n),{recursive:true});
 const executable=process.env.KIMI_CLI_EXECUTABLE??path.join(os.homedir(),'.kimi-code/bin/kimi');if(!fs.existsSync(executable))return {status:'unavailable',boundary:'Native Kimi executable unavailable'};
 const env={PATH:process.env.PATH,HOME:path.join(work,'home'),USERPROFILE:path.join(work,'home'),KIMI_CODE_HOME:path.join(work,'config'),TMPDIR:path.join(work,'tmp'),ZCODE_MEMORY_HOME:path.join(work,'memory'),KIMI_CODE_NO_AUTO_UPDATE:'1',TERM:'xterm-256color',NO_COLOR:'1'};
 assert.equal(spawnSync('git',['init','--quiet','--initial-branch=main'],{cwd:path.join(work,'project'),env}).status,0);
 // Synthetic provider prevents login discovery. No prompt is ever sent to it.
 fs.writeFileSync(path.join(work,'config/config.toml'),'default_model="local-test"\ntelemetry=false\nauto_session_title=false\n[providers.local]\ntype="openai"\nbase_url="http://127.0.0.1:9/v1"\napi_key="synthetic-test-only"\n[models.local-test]\nprovider="local"\nmodel="synthetic"\nmax_context_size=32000\ncapabilities=["tool_use"]\n');
 const old=path.join(work,'plugin-0.2.0');fs.cpSync(path.join(root,'dist/kimi-cli'),old,{recursive:true});const file=path.join(old,'kimi.plugin.json'),manifest=JSON.parse(fs.readFileSync(file));manifest.version='0.2.0';fs.writeFileSync(file,JSON.stringify(manifest,null,2));
 const service=new HostMemory({host:'kimi-cli',home:env.ZCODE_MEMORY_HOME,project:path.join(work,'project')});
 try{await service.tool('memory_save',{path:'keep.md',body:'项目发布先 staging'});await service.tool('memory_settings',{autoExtract:true,recall:{maxChars:3456}});
 const invoke=()=>spawnSync(process.env.PYTHON_EXECUTABLE??'python3',[path.join(root,'scripts/kimi-lifecycle-pty.py'),executable,old,path.join(root,'dist/kimi-cli'),work],{cwd:root,env,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
 let run=invoke(),watchBoundary=null;
 if(run.status!==0&&/EMFILE.*watch/.test(run.stderr??'')){
   watchBoundary='Unmodified Kimi TUI exits with EMFILE in fs.watch inside this sandbox.';
   fs.writeFileSync(path.join(work,'unmodified-driver.log'),JSON.stringify({exit:run.status,stdout:run.stdout,stderr:run.stderr},null,2));
   fs.copyFileSync(path.join(work,'tui-output.log'),path.join(work,'unmodified-tui-output.log'));
   const shim=path.join(work,'test-only-watch.cjs');fs.writeFileSync(shim,"const fs=require('node:fs'),{EventEmitter}=require('node:events');fs.watch=()=>{const w=new EventEmitter();w.close=()=>{};w.ref=w.unref=()=>w;return w};\n");
   env.NODE_OPTIONS='--require='+shim;run=invoke();
 }
 fs.writeFileSync(path.join(work,'driver.log'),JSON.stringify({exit:run.status,stdout:run.stdout,stderr:run.stderr,error:run.error?.message},null,2));
 if(run.status!==0)return {status:'failed',work,boundary:run.stderr??run.error?.message};
 const report=JSON.parse(run.stdout);assert.match((await service.tool('memory_read',{path:'keep.md'})).body,/staging/);const settings=await service.tool('memory_settings');assert.equal(settings.autoExtract,true);assert.equal(settings.recall.maxChars,3456);
 Object.assign(report,{work,dataAndSettingsRetained:true,hookTrustBypassed:false,fsWatchShim:!!watchBoundary,watchBoundary,boundary:'Native TUI manager with isolated synthetic provider; local directories model versioned Release assets. If EMFILE occurs, a test-only fs.watch stub permits manager checks and is explicitly recorded. Remote HTTPS/GitHub download, native model turns, hook permissions and reload delivery not exercised.'});fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));return report;
 }finally{await service.close();}
}
module.exports={checkKimiLifecycle};
if(require.main===module)checkKimiLifecycle(path.resolve(__dirname,'..'),path.resolve(process.argv[2]??'.work/native/kimi-lifecycle')).then(r=>{console.log(JSON.stringify(r,null,2));if(r.status==='failed')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
