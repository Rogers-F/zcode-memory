'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{EventEmitter}=require('node:events');
const {temporary}=require('../helpers.cjs'),{MemoryStore}=require('../../src/core/index.cjs');
const desktop=require('../../adapters/pi-desktop/lib/core'),{createPluginRuntime}=require('../../adapters/pi-desktop/main.js')._internals;
test('PI-Desktop managed runtime disable/re-enable/update disposes events and preserves facts/settings',async t=>{
 const {root}=await temporary(t),storage=path.join(root,'desktop'),project=path.join(root,'project'),events=new EventEmitter();let prefs={autoExtract:false,semanticRecall:false};
 const pi={events,plugin:{getSettings:async()=>prefs,setSettings:async patch=>{prefs={...prefs,...patch};}},models:{list:async()=>[]}};
 const store=new MemoryStore({root:desktop.projectMemoryRoot(storage,project),host:'pi-desktop',project});await store.save({path:'keep.md',body:'项目发布先 staging'});await store.configure({autoExtract:true,recall:{maxChars:3456}});
 const create=()=>createPluginRuntime({storageRoot:storage,pi,pollMs:60000});let active=create();t.after(()=>active.stop());await active.start();await active.start();assert.equal(events.listenerCount('session:modelChanged'),1,'enable is idempotent');
 let writes=0;active.store.writeSessionModel=async()=>{writes++;};events.emit('session:modelChanged',{sessionId:'fixture'});assert.equal(writes,1);
 active.stop();assert.equal(events.listenerCount('session:modelChanged'),0);events.emit('session:modelChanged',{sessionId:'disabled'});assert.equal(writes,1);
 for(const operation of ['enable','update']){active=create();await active.start();assert.equal(events.listenerCount('session:modelChanged'),1,operation);assert.equal(active._internals.settings.autoExtract,false);assert.match((await store.read('keep.md')).body,/staging/);assert.equal((await store.catalog()).settings.recall.maxChars,3456);active.stop();}
 assert.equal(events.listenerCount('plugin:settingsChanged'),0);assert.match((await store.read('keep.md')).body,/staging/,'remove leaves independent storage intact');
});
