// SPDX-License-Identifier: Apache-2.0
// DSH adaptation: validated browser wire contract. No global fetch or localhost fallback.
import { MemoryClientError } from './model.js';

const BASE = '/api/zcode-memory-unified';
const invalid = () => new MemoryClientError('INVALID_RESPONSE', 'Invalid memory API response');
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function decodeSettings(value) {
  if (!isRecord(value) || typeof value.enabled !== 'boolean' || typeof value.local !== 'boolean'
      || value.sessionScoped !== true || value.branch !== 'default-index') throw invalid();
  return { enabled: value.enabled, local: value.local, sessionScoped: true, branch: 'default-index' };
}

export function decodeCatalog(value) {
  if (!isRecord(value) || !Array.isArray(value.workspaces)) throw invalid();
  const ids = new Set();
  const workspaces = value.workspaces.map((workspace) => {
    if (!isRecord(workspace) || typeof workspace.id !== 'string' || !workspace.id || ids.has(workspace.id)
        || typeof workspace.label !== 'string' || !timestamp(workspace.updatedAt) || !Array.isArray(workspace.files)) throw invalid();
    ids.add(workspace.id);
    const names = new Set();
    const files = workspace.files.map((file) => {
      if (!isRecord(file) || typeof file.name !== 'string' || !file.name || names.has(file.name.toLowerCase())
          || /[\\/\u0000-\u001f]/u.test(file.name) || file.name === '.' || file.name === '..'
          || !['index', 'item'].includes(file.kind) || !Number.isSafeInteger(file.size) || file.size < 0
          || !timestamp(file.updatedAt)) throw invalid();
      names.add(file.name.toLowerCase());
      return { name: file.name, kind: file.kind, size: file.size, updatedAt: file.updatedAt };
    });
    return { id: workspace.id, label: workspace.label, updatedAt: workspace.updatedAt, files };
  });
  return { workspaces };
}

export function decodePreview(value) {
  if (!isRecord(value) || typeof value.content !== 'string' || !timestamp(value.updatedAt)) throw invalid();
  return { content: value.content, updatedAt: value.updatedAt };
}

/**
 * @param {(path: string, init: RequestInit) => Promise<Response>} authorizedFetch
 * Must be DSH's authorized host transport. Deliberately no default fetch.
 */
/** Generic Connection RPC is available to RPC-only Desktop/isolated clients as well as Web. */
export function createMemoryRpcApi(rpc) {
  if (typeof rpc?.call !== 'function') throw new TypeError('A DSH Connection RPC caller is required');
  async function request(endpoint, payload, decode, signal) {
    signal?.throwIfAborted();
    const result = await rpc.call('/api', `zcode-memory-unified/${endpoint}`, payload, signal);
    signal?.throwIfAborted();
    if (!isRecord(result) || typeof result.ok !== 'boolean') throw invalid();
    if (!result.ok) {
      if (!isRecord(result.error) || typeof result.error.code !== 'string' || typeof result.error.message !== 'string') throw invalid();
      throw new MemoryClientError(result.error.code, result.error.message);
    }
    return decode(result.value);
  }
  return {
    getSettings: signal => request('settings', {}, decodeSettings, signal),
    setSettings: ({ enabled }, signal) => {
      if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
      return request('settings', { enabled }, decodeSettings, signal);
    },
    getWorkspaces: signal => request('workspaces', {}, decodeCatalog, signal),
    getFile: (workspaceId, fileName, signal) => request('file', { workspaceId, fileName }, decodePreview, signal),
  };
}

export function createMemoryApi(authorizedFetch) {
  if (typeof authorizedFetch !== 'function') throw new TypeError('A DSH authorized transport is required');
  async function request(path, init, decode) {
    const response = await authorizedFetch(`${BASE}${path}`, { ...init, cache: 'no-store' });
    let data;
    try { data = await response.json(); }
    catch { throw new MemoryClientError(response.status === 401 || response.status === 403 ? 'UNAUTHORIZED' : 'INVALID_RESPONSE', 'Invalid memory API response'); }
    if (!response.ok) {
      const error = isRecord(data) && isRecord(data.error) ? data.error : null;
      throw new MemoryClientError(error?.code ?? (response.status === 401 || response.status === 403 ? 'UNAUTHORIZED' : 'REQUEST_FAILED'),
        typeof error?.message === 'string' ? error.message : `Memory API request failed (${response.status})`);
    }
    return decode(data);
  }
  return {
    getSettings: (signal) => request('/settings', { signal }, decodeSettings),
    setSettings: ({ enabled }, signal) => {
      if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
      return request('/settings', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }, decodeSettings);
    },
    getWorkspaces: (signal) => request('/workspaces', { signal }, decodeCatalog),
    getFile: (workspaceId, fileName, signal) => request(`/file?${new URLSearchParams({ workspaceId, fileName })}`, { signal }, decodePreview),
  };
}
