import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {parse} from 'yaml';
const root=new URL('../',import.meta.url);
const require=createRequire(import.meta.url);
test('built client uses the installed DSH module-loader factory contract',async()=>{
  const source=await readFile(new URL('dist/client.js',root),'utf8');
  let loaded;
  vm.runInNewContext(source,{window:{__ModuleLoader__:{load(value){loaded=value;}}},console,URL,TextEncoder,TextDecoder,AbortController,setTimeout,clearTimeout});
  assert.equal(loaded.id,'@local/dsh-zcode-memory');
  const module=loaded.factory(name=>{assert.equal(name,'react');return require('react');});
  assert.equal(typeof module.apply,'function');
  assert.deepEqual([...module.inject],['slots','connection','locale','configForms']);
});
test('bundle is explicitly default-off and contains licenses and public client entry',async()=>{
  const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
  const patch=parse(await readFile(new URL(pkg.dsh.bundle.patch,root),'utf8'));
  assert.equal(patch[0].insert[0].config.enabled,false);
  assert.equal(patch[0].insert[0].name,pkg.name);
  assert.equal(pkg.engines.dsh,'0.2.1-rc.2');
  assert.equal(pkg.scripts.postinstall,undefined);
  for(const file of ['LICENSE','UPSTREAM-NOTICE.md','NOTICE.md','assets/licenses/marked-LICENSE.md'])assert.ok((await readFile(new URL(file,root),'utf8')).length>100);
});
