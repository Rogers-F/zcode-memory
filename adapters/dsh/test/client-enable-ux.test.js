// User-visible regression: distinguish not-yet-loaded/failed settings from an actual off state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { MemoryModel } from '../src/client/model.js';
import { MemoryView } from '../src/client/view.js';
import { apply } from '../src/client/index.js';
const settings = enabled => ({enabled,local:true,sessionScoped:true,branch:'default-index'});
function model(getSettings=async()=>settings(false)) { return new MemoryModel({getSettings,setSettings:async value=>settings(value.enabled),getWorkspaces:async()=>({workspaces:[]})}); }
const documentFor = instance => new JSDOM(renderToStaticMarkup(h(MemoryView,{model:instance,state:instance.getSnapshot()}))).window.document;

test('not-yet-loaded settings do not masquerade as a disabled off switch',()=>{
  const control=documentFor(model()).querySelector('[role=switch]');
  assert.equal(control.disabled,true);
  assert.match(control.textContent,/读取设置/);
  assert.doesNotMatch(control.textContent,/已关闭/);
});
test('ready off state names the action explicitly instead of only displaying 已关闭',async()=>{
  const instance=model();await instance.start();
  const control=documentFor(instance).querySelector('[role=switch]');
  assert.equal(control.disabled,false);
  assert.equal(control.textContent,'开启工作区记忆');
});
test('failed settings expose an enabled retry beside the switch rather than a silent disabled state',async()=>{
  const instance=model(async()=>{throw new Error('controlled settings failure');});await instance.start();
  const document=documentFor(instance);
  const control=document.querySelector('[role=switch]');
  assert.match(control.textContent,/读取失败/);
  const retry=document.querySelector('button[aria-label="重新读取记忆设置"]');
  assert.ok(retry);
  assert.equal(retry.disabled,false);
  assert.match(document.querySelector('[aria-label="工作区记忆设置"]').textContent,/controlled settings failure/);
});

test('native Settings keeps a Workspace Memory navigation entry even while memory is off',()=>{
  const registrations=[];const dictionaries=new Map();
  const form={getSnapshot:()=>({status:'ready',value:{enabled:false},writable:true}),set:async()=>true};
  const mirror={load:async()=>{},getSnapshot:()=>({status:'ready',error:null})};
  apply({connection:{isLoopback:true},
    configForms:{get:id=>{assert.equal(id,'zcode-memory');return form;},describe:()=>mirror,whileServed:(ids,register)=>{assert.deepEqual(ids,['zcode-memory']);return register(new Set(ids));}},
    locale:{register:(ns,dict)=>{dictionaries.set(ns,dict);return()=>{};},bind:ns=>key=>dictionaries.get(ns).zh[key]},
    effect:factory=>factory(),
    slots:{inject:(_name,callback)=>callback(),register:(options,component)=>{registrations.push({options,component});return()=>{};}},
  });
  const page=registrations.find(row=>row.options.name==='settings.section');
  assert.ok(page,'Memory must be reachable from the real Settings shell, not just plugin details');
  assert.equal(page.options.id,'zcode-memory');
  assert.equal(page.options.label(),'工作区记忆');
  const rendered=page.component({close:()=>{}});
  assert.equal(rendered.props.view,'page');
  assert.equal(typeof rendered.props.api.getSettings,'function');
  assert.ok(registrations.some(row=>row.options.name==='plugins.bundle.config'));
});
