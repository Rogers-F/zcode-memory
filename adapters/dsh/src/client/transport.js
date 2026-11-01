// SPDX-License-Identifier: Apache-2.0
// DSH 0.2.1-rc.2: prefer the public Connection RPC capability for every carrier.
// HTTP remains an explicit compatibility Adapter only when RPC is absent.
// Never inspect/copy tokens, choose a localhost port, or retry a rejected RPC through HTTP.
import { createMemoryApi, createMemoryRpcApi } from './api.js';
import { MemoryClientError } from './model.js';

const ALLOWED_PATH = /^\/api\/zcode-memory-unified\/(?:settings|workspaces|file)(?:\?|$)/u;

export function createAuthorizedFetch(environment = globalThis) {
  return (path, init = {}) => {
    if (!ALLOWED_PATH.test(path)) throw new MemoryClientError('INVALID_PATH', 'Unexpected memory API target');
    // Connection's own RPC caller uses a directory-relative URL for reverse-proxy mounts.
    const relativePath = path.slice(1);
    const transport = environment.__DSH_TRANSPORT__;
    if (transport !== undefined) {
      if (typeof transport?.fetch !== 'function') throw new MemoryClientError('TRANSPORT_UNAVAILABLE', '记忆界面无法使用当前DSH连接，请重新连接或重启DSH后重试。');
      return transport.fetch(relativePath, { ...init, credentials: 'same-origin', redirect: 'error' });
    }
    if (!['http:', 'https:'].includes(environment.location?.protocol) || typeof environment.fetch !== 'function') {
      throw new MemoryClientError('TRANSPORT_UNAVAILABLE', '当前环境没有可用的 DSH 已授权传输。');
    }
    // Explicit same-origin mode keeps HttpOnly BrowserAuth cookies attached;
    // redirects cannot move a request (or its content) to another authority.
    return environment.fetch(relativePath, { ...init, mode: 'same-origin', credentials: 'same-origin', redirect: 'error' });
  };
}

/** Client and host must both agree that catalog access is local. */
export function createDshMemoryApi(connection, environment = globalThis) {
  // Bugfix: native/isolated DSH transports may intentionally expose only rpc.call.
  // Select capability before dispatch; an RPC failure NEVER falls back to HTTP or another principal.
  const api = typeof connection.rpc?.call === 'function'
    ? createMemoryRpcApi(connection.rpc)
    : createMemoryApi(createAuthorizedFetch(environment));
  const localSettings = (settings) => ({ ...settings, local: settings.local && connection.isLoopback === true });
  const assertLocal = () => {
    if (connection.isLoopback !== true) throw new MemoryClientError('LOCAL_ONLY', 'Remote catalog access is disabled');
  };
  return {
    getSettings: async (signal) => localSettings(await api.getSettings(signal)),
    setSettings: async (value, signal) => localSettings(await api.setSettings(value, signal)),
    getWorkspaces: (signal) => { assertLocal(); return api.getWorkspaces(signal); },
    getFile: (id, name, signal) => { assertLocal(); return api.getFile(id, name, signal); },
  };
}
