// SPDX-License-Identifier: Apache-2.0
// DSH 0.2.1 native ConfigForms Adapter. Only the shared Host form owns enabled.
// Files use the existing authenticated Connection RPC/HTTP Adapter; no second settings store.
import { createDshMemoryApi } from './transport.js';
import { MemoryClientError } from './model.js';

function waitForShared(promise, signal) {
  signal?.throwIfAborted();
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const cleanup=()=>signal.removeEventListener('abort',abort);
    const abort=()=>{cleanup();reject(signal.reason??new DOMException('Aborted','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}

export function createNativeMemoryApi(connection, configForms, environment = globalThis) {
  if (!configForms?.get || !configForms?.describe) throw new TypeError('Native DSH ConfigForms is required');
  const form=configForms.get('zcode-memory-unified');
  const mirror=configForms.describe();
  const files=createDshMemoryApi(connection,environment);
  function accepted() {
    const snapshot=form.getSnapshot(); // Methods remain bound to their owning form.
    if (snapshot.status!=='ready'||typeof snapshot.value?.enabled!=='boolean') {
      throw new MemoryClientError('SETTINGS_UNAVAILABLE','记忆设置尚未就绪，请确认插件组合包已启用后重试。');
    }
    return {enabled:snapshot.value.enabled,local:connection.isLoopback===true,sessionScoped:true,branch:'default-index',writable:snapshot.writable===true};
  }
  return {
    async getSettings(signal) {
      signal?.throwIfAborted();
      // Explicit page open/refresh uses the same native describe mirror as DSH Settings.
      // It observes the host's failure rather than silently presenting false as a loaded setting.
      await waitForShared(mirror.load(),signal);
      signal?.throwIfAborted();
      const error=mirror.getSnapshot().error;
      if(error)throw new MemoryClientError('SETTINGS_READ_FAILED',String(error));
      return accepted();
    },
    async setSettings({enabled},signal) {
      if(typeof enabled!=='boolean')throw new TypeError('enabled must be a boolean');
      signal?.throwIfAborted();
      if(!accepted().writable)throw new MemoryClientError('SETTINGS_READ_ONLY','当前DSH设置是只读的，无法更改工作区记忆开关。');
      // set() returns boolean, not a settings object; the native form carries revisions and recovery.
      const saved=await waitForShared(form.set('enabled',enabled),signal);
      signal?.throwIfAborted();
      if(saved!==true)throw new MemoryClientError('SETTINGS_WRITE_FAILED','DSH没有接受此次修改，原设置保持不变；请刷新后重试。');
      const settings=accepted();
      if(settings.enabled!==enabled)throw new MemoryClientError('SETTINGS_WRITE_FAILED','设置尚未确认生效，请刷新后核对。');
      return settings;
    },
    getWorkspaces:files.getWorkspaces,
    getFile:files.getFile,
  };
}
