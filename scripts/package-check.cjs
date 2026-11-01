'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.work/package-check');fs.mkdirSync(base,{recursive:true});
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
const work=fs.mkdtempSync(path.join(base,'run-'));for(const d of ['home','tmp'])fs.mkdirSync(path.join(work,d));
const env={PATH:process.env.PATH,HOME:path.join(work,'home'),USERPROFILE:path.join(work,'home'),TMPDIR:path.join(work,'tmp'),TMP:path.join(work,'tmp'),TEMP:path.join(work,'tmp'),LC_ALL:'C',COPYFILE_DISABLE:'1'};
function run(command,args,cwd=work){const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});assert.equal(r.status,0,`${command}: ${r.error?.message??r.stderr}`);return r.stdout;}
function extract(name,label){
  const archive=path.join(root,'artifacts',name),target=path.join(work,label);fs.mkdirSync(target);
  const names=run('tar',['-tzf',archive]).trim().split('\n');
  assert.ok(names.every(p=>p==='package/'||p.startsWith('package/')&&!p.split('/').includes('..')&&!p.includes('/.work/')&&!p.includes('/.git/')),'unsafe packaged path');
  run('tar',['-xzf',archive,'-C',target]);return path.join(target,'package');
}
function cli(packageRoot,host,command,args,home){return JSON.parse(run(process.execPath,[path.join(packageRoot,'bin/zcode-memory.cjs'),'--host',host,'--home',home,'--project','/package-fixture',command,JSON.stringify(args)]));}
function extractZip(name,label){
 const archive=path.join(root,'artifacts',name),target=path.join(work,label);fs.mkdirSync(target);run('unzip',['-t',archive]);
 const names=run('unzip',['-Z1',archive]).trim().split('\n');assert.ok(names.every(p=>!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(s=>['..','.work','.git'].includes(s))),'unsafe ZIP path');run('unzip',['-q',archive,'-d',target]);return target;
}
const packages={npm:extract(`zcode-memory-${version}.tgz`,'npm'),claude:extract(`zcode-memory-claude-code-${version}.tgz`,'claude'),codex:extract(`zcode-memory-codex-cli-${version}.tgz`,'codex'),dsh:extract(`zcode-memory-dsh-${version}.tgz`,'dsh'),kimi:extractZip(`zcode-memory-kimi-cli-${version}.zip`,'kimi')};
for(const [label,host] of [['npm','pi-cli'],['claude','claude-code'],['codex','codex-cli'],['kimi','kimi-cli']]){
  const home=path.join(work,'data-'+label);assert.equal(cli(packages[label],host,'save',{path:'packed.md',body:'以后发布先经过 staging'},home).status,'saved');
  assert.match(cli(packages[label],host,'context',{query:'发布'},home).text,/staging/);
  assert.equal(cli(packages[label],host,'recall',{query:'发布'},home).items.length,1);
  assert.equal(cli(packages[label],host,'forget',{path:'packed.md'},home).status,'forgotten');
}
const desktop=path.join(root,`artifacts/local.zcode-memory-unified-${version}.piplug`),desktopRoot=path.join(work,'desktop');
run('unzip',['-t',desktop]);fs.mkdirSync(desktopRoot);run('unzip',['-q',desktop,'-d',desktopRoot]);
assert.equal(JSON.parse(fs.readFileSync(path.join(desktopRoot,'manifest.json'))).id,'local.zcode-memory-unified');
assert.equal(require(path.join(desktopRoot,'shared.cjs')).TYPES.length,4);
assert.equal(JSON.parse(fs.readFileSync(path.join(desktopRoot,'manifest.json'))).version,version);
const kimi=JSON.parse(fs.readFileSync(path.join(packages.kimi,'kimi.plugin.json')));assert.equal(kimi.version,version);
assert.ok(fs.existsSync(path.join(packages.kimi,'node_modules/yaml/package.json')));assert.ok(fs.existsSync(path.join(packages.kimi,'SYSTEM.md')));assert.ok(fs.existsSync(path.join(packages.kimi,'commands/memory.md')));
for(const file of ['README.md','UNIFIED-README.md']){const guide=fs.readFileSync(path.join(packages.kimi,file),'utf8');assert.match(guide,/unzip /);assert.doesNotMatch(guide,/\/plugins install\s+(?!https?:\/\/)[^\s`]*\.zip\b/);}
for(const [label,manifest]of [['npm','package.json'],['claude','.claude-plugin/plugin.json'],['codex','.codex-plugin/plugin.json'],['dsh','package.json']])assert.equal(JSON.parse(fs.readFileSync(path.join(packages[label],manifest))).version,version);
const dshPackage=JSON.parse(fs.readFileSync(path.join(packages.dsh,'package.json')));
assert.equal(dshPackage.engines.node,'>=24.0.0');assert.ok(fs.readFileSync(path.join(packages.dsh,'cordis.patch.yml'),'utf8').includes(dshPackage.name));
assert.ok(fs.readFileSync(path.join(packages.dsh,'dist/client.js'),'utf8').includes(`id:${JSON.stringify(dshPackage.name)}`),'DSH browser bundle must match the native package identity');
run(process.execPath,['--input-type=module','-e',`const {createMemoryStorage}=await import(${JSON.stringify(require('node:url').pathToFileURL(path.join(packages.dsh,'src/storage.js')).href)});const store=createMemoryStorage({rootDir:${JSON.stringify(path.join(work,'dsh-data'))},workspacePath:'/fixture'});await store.ensure();await store.unified.save({body:'以后中文回答'});if((await store.unified.snapshot()).facts.length!==1)throw Error('packaged DSH storage failed');`]);
const config=path.join(work,'config-review');run(process.execPath,[path.join(packages.codex,'scripts/configure.cjs'),'--host','codex-cli','--output',config]);
assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(config,'hooks.json'))).hooks).length,3);
const second=spawnSync(process.execPath,[path.join(packages.codex,'scripts/configure.cjs'),'--host','codex-cli','--output',config],{env,encoding:'utf8'});assert.notEqual(second.status,0,'configuration generator must refuse overwrite');
const kimiConfig=path.join(work,'kimi-config-review');run(process.execPath,[path.join(packages.kimi,'scripts/configure.cjs'),'--host','kimi-cli','--output',kimiConfig]);assert.ok(fs.existsSync(path.join(kimiConfig,'bin/mcp.cjs')));assert.ok(fs.existsSync(path.join(kimiConfig,'node_modules/yaml/package.json')));assert.equal(spawnSync(process.execPath,[path.join(packages.kimi,'scripts/configure.cjs'),'--host','kimi-cli','--output',kimiConfig],{env,encoding:'utf8'}).status,1);
assert.match(fs.readFileSync(path.join(kimiConfig,'README.md'),'utf8'),/\/plugins install \/absolute\/kimi-memory-plugin/,'configured plugin must explain installation of the extracted directory');
// Exercise the actual offline plugin command and cwd, not just its manifest.
const kimiHome=path.join(work,'kimi-hook-home');cli(packages.kimi,'kimi-cli','save',{path:'hook.md',body:'项目发布先 staging。'+'审批细则。'.repeat(40)+' BODY-ONLY-KIMI-PACKED'},kimiHome);
const hook=spawnSync(process.execPath,['./bin/hook.cjs','--host','kimi-cli'],{cwd:packages.kimi,env:{...env,ZCODE_MEMORY_HOME:kimiHome},input:JSON.stringify({hook_event_name:'UserPromptSubmit',client_type:'kimi_code_cli',session_id:'package-kimi',cwd:'/package-fixture',prompt:[{type:'text',text:'项目发布'}]}),encoding:'utf8'});assert.equal(hook.status,0,hook.stderr);assert.match(hook.stdout,/BODY-ONLY-KIMI-PACKED/);assert.doesNotMatch(hook.stdout,/hookSpecificOutput|\[object Object\]/);
const report={status:'passed',version,checks:['six archives extracted with matching versions','PI-Desktop ZIP CRC and bundled core','four isolated CLI package flows','Kimi offline ZIP/runtime/yaml and real plugin hook command','DSH package/client/Cordis identity and standalone storage','Codex and Kimi review config generation and overwrite refusal'],work};
fs.writeFileSync(path.join(base,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
