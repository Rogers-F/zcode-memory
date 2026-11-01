// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryApi, decodeSettings, decodeCatalog, decodePreview } from '../src/client/api.js';
import { createAuthorizedFetch, createDshMemoryApi } from '../src/client/transport.js';

const settings = { enabled: false, local: true, sessionScoped: true, branch: 'default-index' };
const catalog = { workspaces: [{ id: 'opaque-id', label: '工作区', updatedAt: 1000, files: [{ name: 'MEMORY.md', kind: 'index', size: 10, updatedAt: 1000 }] }] };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('API requires an explicitly supplied authorized fetch', () => {
  assert.throws(() => createMemoryApi(), /authorized transport/);
});

test('API uses only frozen routes and encoded opaque ids/filenames', async () => {
  const calls = [];
  const responses = [settings, settings, catalog, { content: '# test', updatedAt: 1000 }];
  const api = createMemoryApi(async (path, init) => { calls.push({ path, init }); return json(responses.shift()); });
  const controller = new AbortController();
  await api.getSettings(controller.signal);
  await api.setSettings({ enabled: false }, controller.signal);
  await api.getWorkspaces(controller.signal);
  await api.getFile('工作区&?x', 'a &?#.md', controller.signal);
  assert.equal(calls[0].path, '/api/zcode-memory/settings');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.body, '{"enabled":false}');
  assert.equal(calls[1].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[2].path, '/api/zcode-memory/workspaces');
  const query = new URL(calls[3].path, 'https://example.invalid').searchParams;
  assert.equal(query.get('workspaceId'), '工作区&?x');
  assert.equal(query.get('fileName'), 'a &?#.md');
  assert.equal(query.has('path'), false);
  assert.ok(calls.every(({ init }) => init.signal === controller.signal && init.cache === 'no-store'));
});

test('wire decoders reject malformed settings, aliases and preview; drop unrelated path fields', () => {
  assert.throws(() => decodeSettings({ ...settings, enabled: 'false' }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => decodeSettings({ ...settings, sessionScoped: false }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => decodeSettings({ ...settings, branch: 'semantic' }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => decodePreview({ content: '# a', updatedAt: '2026-01-01' }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => decodeCatalog({ workspaces: [catalog.workspaces[0], catalog.workspaces[0]] }), { code: 'INVALID_RESPONSE' });
  for (const name of ['../a.md', 'a/../b.md', '/a.md', './a.md', 'a//b.md', 'a\\b.md', 'C:/a.md', '\u0000.md']) {
    const value = structuredClone(catalog); value.workspaces[0].files[0].name = name;
    assert.throws(() => decodeCatalog(value), { code: 'INVALID_RESPONSE' });
  }
  const aliases = structuredClone(catalog);
  aliases.workspaces[0].files.push({ ...aliases.workspaces[0].files[0], name: 'memory.md' });
  assert.throws(() => decodeCatalog(aliases), { code: 'INVALID_RESPONSE' });
  const extra = structuredClone(catalog);
  extra.workspaces[0].path = 'secret'; extra.workspaces[0].files[0].path = 'secret';
  assert.deepEqual(decodeCatalog(extra), catalog);
});

test('catalog is top-level only: nested filenames are rejected, not silently expanded', () => {
  for (const name of ['topics/项目说明.md', 'topics\\项目说明.md']) {
    const nested = structuredClone(catalog);
    nested.workspaces[0].files[0] = { name, kind: 'item', size: 10, updatedAt: 1000 };
    assert.throws(() => decodeCatalog(nested), { code: 'INVALID_RESPONSE' });
  }
});

test('HTTP errors preserve host error code and handle non-JSON auth rejections', async () => {
  const tooLarge = createMemoryApi(async () => json({ error: { code: 'FILE_TOO_LARGE', message: 'limit' } }, 413));
  await assert.rejects(tooLarge.getFile('id', 'file.md'), { code: 'FILE_TOO_LARGE', message: 'limit' });
  for (const status of [401, 403]) {
    const api = createMemoryApi(async () => new Response('unauthorized', { status }));
    await assert.rejects(api.getSettings(), { code: 'UNAUTHORIZED' });
  }
  const invalid = createMemoryApi(async () => new Response('not JSON'));
  await assert.rejects(invalid.getSettings(), { code: 'INVALID_RESPONSE' });
});

test('ordinary Web sends BrowserAuth cookies on same-origin directory-relative paths', async () => {
  let call;
  const send = createAuthorizedFetch({ location: { protocol: 'https:' }, fetch: async (path, init) => { call = { path, init }; return json(settings); } });
  await send('/api/zcode-memory/settings', { method: 'GET' });
  assert.equal(call.path, 'api/zcode-memory/settings');
  assert.equal(call.init.credentials, 'same-origin');
  assert.equal(call.init.mode, 'same-origin');
  assert.equal(call.init.redirect, 'error');
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers?.Authorization, undefined);
});

test('provided DSH transport is preferred and retains receiver binding', async () => {
  const calls = [];
  const transport = { async fetch(path, init) { assert.equal(this, transport); calls.push({ path, init }); return json(settings); } };
  const send = createAuthorizedFetch({ __DSH_TRANSPORT__: transport, fetch: () => assert.fail('global fetch must not run') });
  await send('/api/zcode-memory/settings');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, 'api/zcode-memory/settings');
  assert.equal(calls[0].init.credentials, 'same-origin');
});

test('unsupported carriers and file pages fail closed, never fallback to localhost', () => {
  for (const environment of [
    { __DSH_TRANSPORT__: {}, location: { protocol: 'http:' }, fetch: () => assert.fail('fallback') },
    { location: { protocol: 'file:' }, fetch: () => assert.fail('file fallback') },
    {},
  ]) assert.throws(() => createAuthorizedFetch(environment)('/api/zcode-memory/settings'), { code: 'TRANSPORT_UNAVAILABLE' });
});

test('authorized fetch rejects arbitrary origins and paths before any transport call', () => {
  const send = createAuthorizedFetch({ location: { protocol: 'https:' }, fetch: () => assert.fail('must not send') });
  for (const path of ['http://localhost:1234/api/zcode-memory/settings', '//remote/api', '/api/other', '/api/zcode-memory/settings/evil']) {
    assert.throws(() => send(path), { code: 'INVALID_PATH' });
  }
});

test('remote isLoopback=false masks local host capability and refuses catalog/file directly', async () => {
  const paths = [];
  const api = createDshMemoryApi({ isLoopback: false }, { location: { protocol: 'https:' }, fetch: async (path) => { paths.push(path); return json({ ...settings, enabled: true, local: true }); } });
  assert.equal((await api.getSettings()).local, false);
  assert.equal((await api.setSettings({ enabled: true })).local, false);
  assert.throws(() => api.getWorkspaces(), { code: 'LOCAL_ONLY' });
  assert.throws(() => api.getFile('id', 'file.md'), { code: 'LOCAL_ONLY' });
  assert.deepEqual(paths, ['api/zcode-memory/settings', 'api/zcode-memory/settings']);
});

test('local browser still respects host local=false', async () => {
  const api = createDshMemoryApi({ isLoopback: true }, { location: { protocol: 'http:' }, fetch: async () => json({ ...settings, local: false }) });
  assert.equal((await api.getSettings()).local, false);
});
