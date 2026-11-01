// SPDX-License-Identifier: Apache-2.0
// Additive native DSH Settings and plugin-detail pages; never replace the GUI shell.
import { createElement as h } from 'react';
import { MemoryConfig } from './view.js';
import { createNativeMemoryApi } from './native-settings.js';

export const inject = ['slots', 'connection', 'locale', 'configForms'];
export const PACKAGE_NAME = '@local/zcode-memory-dsh';
const NS='settings.zcodeMemory';

export function apply(ctx) {
  ctx.effect(()=>ctx.locale.register(NS,{zh:{nav:'工作区记忆'},en:{nav:'Workspace Memory'}}),'memory settings locale');
  const t=ctx.locale.bind(NS);
  const api=createNativeMemoryApi(ctx.connection,ctx.configForms);
  function BoundMemoryConfig(props) { return h(MemoryConfig,{...props,api}); }
  // Settings shell gives {close}, not view/form. Bind page mode explicitly.
  function MemorySettings(props) { return h(MemoryConfig,{...props,view:'page',api}); }
  ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({
    name:'plugins.bundle.config',key:PACKAGE_NAME,
  },BoundMemoryConfig));
  // Follow namespace lifetime, NOT enabled value: users must reach the switch while it is off.
  ctx.effect(()=>ctx.configForms.whileServed(['zcode-memory-unified'],()=>
    ctx.slots.inject('settings.section',()=>ctx.slots.register({
      name:'settings.section',id:'zcode-memory-unified',order:40,label:()=>t('nav'),locale:NS,
    },MemorySettings))), 'memory settings section');
  // Cordis apply returns void. A controller object is not a valid effect.
}
