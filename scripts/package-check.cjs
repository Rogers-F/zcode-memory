'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.work/package-check');fs.mkdirSync(base,{recursive:true});
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
const packages={npm:extract('zcode-memory-0.1.0.tgz','npm'),claude:extract('zcode-memory-claude-code-0.1.0.tgz','claude'),codex:extract('zcode-memory-codex-cli-0.1.0.tgz','codex'),dsh:extract('zcode-memory-dsh-0.1.0.tgz','dsh')};
for(const [label,host] of [['npm','pi-cli'],['claude','claude-code'],['codex','codex-cli']]){
  const home=path.join(work,'data-'+label);assert.equal(cli(packages[label],host,'save',{path:'packed.md',body:'以后发布先经过 staging'},home).status,'saved');
  assert.match(cli(packages[label],host,'context',{query:'发布'},home).text,/staging/);
  assert.equal(cli(packages[label],host,'recall',{query:'发布'},home).items.length,1);
  assert.equal(cli(packages[label],host,'forget',{path:'packed.md'},home).status,'forgotten');
}
const desktop=path.join(root,'artifacts/local.zcode-memory-unified-0.1.0.piplug'),desktopRoot=path.join(work,'desktop');
run('unzip',['-t',desktop]);fs.mkdirSync(desktopRoot);run('unzip',['-q',desktop,'-d',desktopRoot]);
assert.equal(JSON.parse(fs.readFileSync(path.join(desktopRoot,'manifest.json'))).id,'local.zcode-memory-unified');
assert.equal(require(path.join(desktopRoot,'shared.cjs')).TYPES.length,4);
const dshPackage=JSON.parse(fs.readFileSync(path.join(packages.dsh,'package.json')));
assert.equal(dshPackage.engines.node,'>=24.0.0');assert.ok(fs.readFileSync(path.join(packages.dsh,'cordis.patch.yml'),'utf8').includes(dshPackage.name));
assert.ok(fs.readFileSync(path.join(packages.dsh,'dist/client.js'),'utf8').includes(`id:${JSON.stringify(dshPackage.name)}`),'DSH browser bundle must match the native package identity');
run(process.execPath,['--input-type=module','-e',`const {createMemoryStorage}=await import(${JSON.stringify(require('node:url').pathToFileURL(path.join(packages.dsh,'src/storage.js')).href)});const store=createMemoryStorage({rootDir:${JSON.stringify(path.join(work,'dsh-data'))},workspacePath:'/fixture'});await store.ensure();await store.unified.save({body:'以后中文回答'});if((await store.unified.snapshot()).facts.length!==1)throw Error('packaged DSH storage failed');`]);
const config=path.join(work,'config-review');run(process.execPath,[path.join(packages.codex,'scripts/configure.cjs'),'--host','codex-cli','--output',config]);
assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(config,'hooks.json'))).hooks).length,3);
const second=spawnSync(process.execPath,[path.join(packages.codex,'scripts/configure.cjs'),'--host','codex-cli','--output',config],{env,encoding:'utf8'});assert.notEqual(second.status,0,'configuration generator must refuse overwrite');
const report={status:'passed',checks:['five archives extracted','PI-Desktop ZIP CRC and bundled core','three isolated CLI package flows','DSH package/client/Cordis identity and standalone storage','Codex review config generation and overwrite refusal'],work};
fs.writeFileSync(path.join(base,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
