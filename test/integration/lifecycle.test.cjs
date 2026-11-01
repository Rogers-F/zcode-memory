'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),{spawnSync}=require('node:child_process');
const {temporary}=require('../helpers.cjs');
test('real lifecycle CLI persists Pi state across new processes and preserves memory/settings on failure',async t=>{
 const {root,store}=await temporary(t),home=path.join(root,'home'),agent=path.join(root,'agent'),source='git:github.com/Rogers-F/zcode-memory';await fs.mkdir(home);await fs.mkdir(agent);const file=path.join(agent,'settings.json');await fs.writeFile(file,JSON.stringify({packages:[{source,extensions:['+adapters/pi-cli/index.ts']}],theme:'dark'}));await store.save({path:'keep.md',body:'项目发布先 staging'});
 const env={PATH:process.env.PATH,HOME:home,USERPROFILE:home,PI_CODING_AGENT_DIR:agent};
 const run=action=>spawnSync(process.execPath,[path.resolve('bin/zcode-memory.cjs'),'host',action,'--host','pi-cli','--source',source],{env,encoding:'utf8'});
 for(const [action,enabled]of [['enable',true],['disable',false],['enable',true]]){const result=run(action);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).enabled,enabled);const status=run('status');assert.equal(JSON.parse(status.stdout).enabled,enabled);}
 assert.equal(JSON.parse(await fs.readFile(file)).theme,'dark');const before=await fs.readFile(file,'utf8');assert.notEqual(run('install').status,0);assert.equal(await fs.readFile(file,'utf8'),before);assert.match((await store.read('keep.md')).body,/staging/);
 const metadata=path.join(home,'.zcode-memory/lifecycle/pi-cli/state.json');assert.equal(JSON.parse(await fs.readFile(metadata)).version,require('../../src/version.cjs'));assert.deepEqual((await fs.readdir(home)),['.zcode-memory']);
});
