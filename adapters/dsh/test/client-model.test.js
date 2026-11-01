// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryModel, MemoryClientError, MAX_PREVIEW_BYTES, viewerMode, filterFiles, formatBytes,
  formatMemoryUpdatedAt, SETTINGS_NOTICE, PROVIDER_NOTICE } from '../src/client/model.js';

const settings = (values = {}) => ({ enabled: true, local: true, sessionScoped: true, branch: 'default-index', ...values });
const file = (name = 'MEMORY.md', size = 20) => ({ name, size, kind: name === 'MEMORY.md' ? 'index' : 'item', updatedAt: 1000 });
const workspace = (id = 'one', files = [file()]) => ({ id, label: id, updatedAt: 1000, files });
function setup(overrides = {}) {
  const calls = [];
  let accepted = settings();
  const api = {
    getSettings: async () => { calls.push('settings'); return accepted; },
    setSettings: async ({ enabled }) => { calls.push(`enabled:${enabled}`); accepted = settings({ enabled }); return accepted; },
    getWorkspaces: async () => { calls.push('catalog'); return { workspaces: [workspace()] }; },
    getFile: async (id, name) => { calls.push(`file:${id}/${name}`); return { content: '# Memory', updatedAt: 1000 }; },
    ...overrides,
  };
  return { model: new MemoryModel(api), calls, api };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('default-off fail-closed state and required session/cost/provider notices', () => {
  const { model, calls } = setup();
  assert.equal(model.state.settings.enabled, false);
  assert.equal(model.state.settings.local, false);
  assert.equal(viewerMode(model.state), 'loading');
  assert.deepEqual(calls, []);
  // 开关行描述与 ZCode zh-CN settings.memoryDescription 逐字一致
  assert.equal(SETTINGS_NOTICE, '在工作区中保存并复用长期上下文，新会话生效。开启后可能增加模型调用和 Token 成本。');
  // DSH 特有的提供方边界披露保留
  assert.match(PROVIDER_NOTICE, /私有目录/);
  assert.match(PROVIDER_NOTICE, /不修改工作区项目文件/);
  assert.match(PROVIDER_NOTICE, /发送给你选择的模型服务商/);
  assert.match(PROVIDER_NOTICE, /关闭不会删除已有记忆/);
});

test('disabled and remote modes never request catalog or file', async () => {
  for (const values of [{ enabled: false, local: true }, { enabled: true, local: false }]) {
    const { model, calls } = setup({ getSettings: async () => settings(values) });
    await model.start();
    await model.loadCatalog();
    await model.selectWorkspace('one');
    await model.selectFile('MEMORY.md');
    assert.equal(viewerMode(model.state), values.local ? 'disabled' : 'remote');
    assert.deepEqual(calls, []);
  }
});

test('initial load chooses a workspace and readonly file; no automatic polling', async () => {
  const { model, calls } = setup();
  await model.start();
  await tick();
  assert.equal(viewerMode(model.state), 'ready');
  assert.equal(model.state.workspaceId, 'one');
  assert.equal(model.state.fileName, 'MEMORY.md');
  assert.equal(model.state.preview.content, '# Memory');
  assert.deepEqual(calls, ['settings', 'catalog', 'file:one/MEMORY.md']);
});

test('workspace switch loads its own file and preserves the search query like ZCode', async () => {
  const { model, calls } = setup({ getWorkspaces: async () => ({ workspaces: [workspace(), workspace('two', [file('two.md')])] }) });
  await model.start();
  model.setQuery('MEMORY');
  await model.selectWorkspace('two');
  assert.equal(model.state.workspaceId, 'two');
  assert.equal(model.state.fileName, 'two.md');
  assert.equal(model.state.query, 'MEMORY'); // ZCode 切换 scope 时保留搜索词
  assert.ok(calls.includes('file:two/two.md'));
});

test('refresh rereads settings/catalog/current file and preserves valid selections', async () => {
  const { model, calls } = setup({ getWorkspaces: async () => { calls.push('catalog'); return { workspaces: [workspace(), workspace('two', [file('a.md'), file('b.md')])] }; } });
  await model.start();
  await model.selectWorkspace('two');
  await model.selectFile('b.md');
  calls.length = 0;
  await model.refresh();
  assert.equal(model.state.workspaceId, 'two');
  assert.equal(model.state.fileName, 'b.md');
  assert.deepEqual(calls, ['settings', 'catalog', 'file:two/b.md']);
});

test('refresh falls back if selected workspace or file disappeared', async () => {
  let workspaces = [workspace('one', [file('one.md')]), workspace('two', [file('two.md')])];
  const { model } = setup({ getWorkspaces: async () => ({ workspaces }) });
  await model.start();
  await model.selectWorkspace('two');
  workspaces = [workspace('one', [file('new.md')])];
  await model.refresh();
  assert.equal(model.state.workspaceId, 'one');
  assert.equal(model.state.fileName, 'new.md');
});

test('empty catalog and empty workspace do not attempt file reads', async () => {
  const { model, calls, api } = setup({ getWorkspaces: async () => ({ workspaces: [] }) });
  await model.start();
  assert.equal(viewerMode(model.state), 'empty');
  assert.equal(model.state.preview, null);
  api.getWorkspaces = async () => ({ workspaces: [workspace('empty', [])] });
  await model.refresh();
  assert.equal(viewerMode(model.state), 'ready');
  assert.equal(model.state.fileName, null);
  assert.deepEqual(calls, ['settings', 'settings']);
});

test('catalog error clears stale content and explicit refresh recovers', async () => {
  const { model, api } = setup();
  await model.start();
  api.getWorkspaces = async () => { throw new Error('catalog unavailable'); };
  await model.refresh();
  assert.equal(viewerMode(model.state), 'error');
  assert.equal(model.state.preview, null);
  assert.equal(model.state.workspaceId, null);
  assert.match(model.state.catalogError, /catalog unavailable/);
  api.getWorkspaces = async () => ({ workspaces: [workspace()] });
  await model.refresh();
  assert.equal(viewerMode(model.state), 'ready');
});

test('settings authentication error blocks catalog and leaves default disabled', async () => {
  const { model, calls } = setup({ getSettings: async () => { throw new MemoryClientError('UNAUTHORIZED', 'expired'); } });
  await model.start();
  assert.equal(viewerMode(model.state), 'error');
  assert.match(model.state.settingsError, /授权已失效/);
  assert.equal(model.state.settings.enabled, false);
  assert.deepEqual(calls, []);
});

test('toggle is not optimistic; rejection keeps accepted host setting', async () => {
  const save = deferred();
  const { model } = setup({ getSettings: async () => settings({ enabled: false }), setSettings: () => save.promise });
  await model.start();
  const pending = model.setEnabled(true);
  assert.equal(model.state.settings.enabled, false);
  assert.equal(model.state.saving, true);
  save.reject(new Error('read-only profile'));
  await pending;
  assert.equal(model.state.settings.enabled, false);
  assert.equal(model.state.saving, false);
  assert.match(model.state.saveError, /read-only profile/);
});

test('enable/disable commit only accepted settings; disabling clears cached content', async () => {
  const { model, api, calls } = setup();
  api.getSettings = async () => settings({ enabled: false });
  await model.start();
  await model.setEnabled(true);
  assert.equal(model.state.settings.enabled, true);
  assert.equal(model.state.previewStatus, 'ready');
  calls.length = 0;
  await model.setEnabled(false);
  assert.equal(viewerMode(model.state), 'disabled');
  assert.equal(model.state.preview, null);
  assert.deepEqual(model.state.workspaces, []);
  assert.deepEqual(calls, ['enabled:false']);
});

test('metadata above 5 MiB rejects without issuing a preview request', async () => {
  const { model, calls } = setup({ getWorkspaces: async () => ({ workspaces: [workspace('one', [file('huge.md', MAX_PREVIEW_BYTES + 1)])] }) });
  await model.start();
  assert.equal(model.state.previewStatus, 'error');
  assert.match(model.state.previewError, /5 MiB/);
  assert.deepEqual(calls, ['settings']);
});

test('5 MiB limit uses UTF-8 bytes, includes exact boundary, not JS characters', async () => {
  const { model, api } = setup({ getFile: async () => ({ content: 'a'.repeat(MAX_PREVIEW_BYTES), updatedAt: 1000 }) });
  await model.start();
  assert.equal(model.state.previewStatus, 'ready');
  api.getFile = async () => ({ content: '中'.repeat(Math.ceil(MAX_PREVIEW_BYTES / 3)), updatedAt: 1000 });
  await model.selectFile('MEMORY.md');
  assert.equal(model.state.previewStatus, 'error');
  assert.equal(model.state.preview, null);
});

test('host path/security/read errors get actionable messages', async () => {
  for (const [code, pattern] of [['FILE_TOO_LARGE', /5 MiB/], ['FILE_CHANGED', /已更新/], ['FILE_NOT_FOUND', /已被删除/], ['INVALID_PATH', /大小写别名/]]) {
    const { model } = setup({ getFile: async () => { throw new MemoryClientError(code, code); } });
    await model.start();
    assert.match(model.state.previewError, pattern);
    assert.equal(model.state.preview, null);
  }
});

test('late file response cannot overwrite a newer workspace selection', async () => {
  const first = deferred();
  const { model } = setup({
    getWorkspaces: async () => ({ workspaces: [workspace(), workspace('two', [file('two.md')])] }),
    getFile: (id) => id === 'one' ? first.promise : Promise.resolve({ content: 'second', updatedAt: 1000 }),
  });
  const start = model.start();
  await tick();
  await model.selectWorkspace('two');
  first.resolve({ content: 'stale', updatedAt: 1000 });
  await start;
  assert.equal(model.state.preview.content, 'second');
  assert.equal(model.state.workspaceId, 'two');
});

test('disable aborts in-flight preview and ignores a late completion', async () => {
  const preview = deferred();
  let signal;
  const { model } = setup({ getFile: (_id, _name, value) => { signal = value; return preview.promise; } });
  const start = model.start();
  await tick();
  await model.setEnabled(false);
  assert.equal(signal.aborted, true);
  preview.resolve({ content: 'late memory', updatedAt: 1000 });
  await start;
  assert.equal(viewerMode(model.state), 'disabled');
  assert.equal(model.state.preview, null);
});

test('stale catalog success cannot expose files after a remote transition', async () => {
  const catalog = deferred();
  const { model, api, calls } = setup({ getWorkspaces: () => catalog.promise });
  const start = model.start();
  await tick();
  api.getSettings = async () => settings({ local: false });
  await model.refresh();
  catalog.resolve({ workspaces: [workspace()] });
  await start;
  assert.equal(viewerMode(model.state), 'remote');
  assert.deepEqual(model.state.workspaces, []);
  assert.deepEqual(calls, ['settings']);
});

test('dispose aborts requests and start can remount (React StrictMode)', async () => {
  const pending = deferred();
  let signal;
  const { model, api } = setup({ getSettings: (value) => { signal = value; return pending.promise; } });
  const start = model.start();
  model.dispose();
  assert.equal(signal.aborted, true);
  pending.resolve(settings());
  await start;
  assert.equal(model.state.settings.enabled, false);
  api.getSettings = async () => settings();
  await model.start();
  assert.equal(model.state.previewStatus, 'ready');
});

test('filename search is trimmed, case-insensitive and not content search', () => {
  const files = [file('MEMORY.md'), file('user-preference.md')];
  assert.deepEqual(filterFiles(files, '  MeMoRy '), [files[0]]);
  assert.equal(filterFiles(files, 'not found').length, 0);
  assert.equal(filterFiles(files, '').length, 2);
  assert.equal(formatBytes(MAX_PREVIEW_BYTES), '5.0 MiB');
  assert.equal(formatBytes(1024), '1.0 KiB');
  assert.equal(formatBytes(10), '10 B');
});

test('relative updated-at formatting ports the ZCode thresholds and zh/en wording', () => {
  // 固定基准：2026-10-23 周五 15:00，本周一 = 10-19，昨天 = 10-22（周四），周内工作日分支用 10-21（周三）覆盖
  const now = new Date(2026, 9, 23, 15, 0, 0).getTime();
  const at = (y, mo, d, hh, mm) => new Date(y, mo, d, hh, mm).getTime();
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: Number.NaN }), '刚刚'); // ZCode 对非法值回退 justNow
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: now - 30_000 }), '刚刚');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: now - 5 * 60_000 }), '5 分钟前');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: now - 29 * 60_000 }), '29 分钟前');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2026, 9, 23, 8, 5) }), '今天 08:05');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2026, 9, 22, 23, 40) }), '昨天 23:40');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2026, 9, 21, 0, 30) }), '周三 00:30'); // 本周内但非今天/昨天
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2026, 9, 11, 9, 15) }), '10 月 11 日 09:15'); // 上周日，已出本周
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2025, 11, 31, 9, 0) }), '2025 年 12 月 31 日 09:00');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: now - 30_000, lang: 'en' }), 'Just now');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: now - 5 * 60_000, lang: 'en' }), '5 min ago');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2026, 9, 23, 8, 5), lang: 'en' }), 'Today 08:05');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2026, 9, 22, 23, 40), lang: 'en' }), 'Yesterday 23:40');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2026, 9, 21, 0, 30), lang: 'en' }), 'Wed 00:30');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2026, 9, 11, 9, 15), lang: 'en' }), '10/11 09:15');
  assert.equal(formatMemoryUpdatedAt({ now, updatedAt: at(2025, 11, 31, 9, 0), lang: 'en' }), '2025/12/31 09:00');
});
