// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, act, StrictMode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { MemoryModel, MAX_PREVIEW_BYTES } from '../src/client/model.js';
import { MemoryView, MemoryConfig, MemoryPage } from '../src/client/view.js';
import { MarkdownPreview } from '../src/client/markdown.js';
import { apply, inject, PACKAGE_NAME } from '../src/client/index.js';
import { fakeNativeSettings, addNativeContext } from './helpers/native-settings.js';

const settings = (values = {}) => ({ enabled: true, local: true, sessionScoped: true, branch: 'default-index', ...values });
const file = (name, size = 20) => ({ name, size, kind: name === 'MEMORY.md' ? 'index' : 'item', updatedAt: 1000 });
function modelFor(overrides = {}) {
  return new MemoryModel({
    getSettings: async () => settings(),
    setSettings: async (value) => settings(value),
    getWorkspaces: async () => ({ workspaces: [
      { id: 'one', label: '工作区一', updatedAt: 1000, files: [file('MEMORY.md'), file('project.md')] },
      { id: 'two', label: '工作区二', updatedAt: 1000, files: [] },
    ] }),
    getFile: async () => ({ content: '# 记忆\n\n**只读**正文', updatedAt: 1000 }),
    ...overrides,
  });
}
function documentFor(model) {
  return new JSDOM(renderToStaticMarkup(h(MemoryView, { model, state: model.getSnapshot() }))).window.document;
}

test('plugin registers additive Settings and bundle pages with shared native settings', () => {
  const waits = [], registrations = [];
  apply(addNativeContext({ connection: { isLoopback: true }, slots: {
    inject: (name, callback) => { waits.push(name); return callback(); },
    register: (options, component) => { registrations.push({ options, component }); return () => {}; },
  } }));
  assert.deepEqual(inject, ['slots', 'connection', 'locale', 'configForms']);
  assert.deepEqual(waits, ['plugins.bundle.config', 'settings.section']);
  assert.equal(registrations[1].options.id, 'zcode-memory');
  assert.equal(registrations[1].options.label(), '工作区记忆');
  assert.equal(registrations[0].options.name, 'plugins.bundle.config');
  assert.equal(registrations[0].options.key, PACKAGE_NAME);
  assert.equal(PACKAGE_NAME, '@local/dsh-zcode-memory');
  assert.equal(Object.hasOwn(registrations[0].options, 'inject'), false);
  const form = { marker: 'slot-form' };
  const untrustedApi = { getSettings: () => assert.fail('slot api prop must not replace bound transport') };
  const element = registrations[0].component({ view: 'page', form, api: untrustedApi });
  assert.equal(element.type, MemoryConfig);
  assert.equal(element.props.view, 'page');
  assert.equal(element.props.form, form);
  assert.notEqual(element.props.api, untrustedApi);
  assert.equal(typeof element.props.api.getSettings, 'function');
  assert.match(renderToStaticMarkup(h(registrations[0].component, { view: 'summary' })), /默认关闭/);
});

test('summary view contains no data access or full-page mount', () => {
  const html = renderToStaticMarkup(h(MemoryConfig, { view: 'summary', api: new Proxy({}, { get: () => assert.fail('summary must not fetch') }) }));
  assert.match(html, /默认关闭/);
  assert.doesNotMatch(html, /data-zcode-memory/);
});

test('initial DOM defaults off and exposes a disabled accessible switch', () => {
  const document = documentFor(modelFor());
  const control = document.querySelector('[role=switch]');
  assert.equal(control.getAttribute('aria-checked'), 'false');
  assert.equal(control.disabled, true);
  // 未加载完成时开关不能伪装成“已关闭”，状态文字走视觉隐藏但可访问的席位
  assert.match(control.textContent, /读取设置/);
  assert.doesNotMatch(control.textContent, /已关闭/);
  assert.match(document.body.textContent, /新会话生效/);
  assert.match(document.body.textContent, /Token 成本/);
  assert.match(document.body.textContent, /模型服务商/);
  assert.equal(document.querySelector('.zmem-scope-trigger'), null);
});

test('ready DOM mirrors the ZCode layout: capsule scope menu, count, search, refresh, readonly preview', async () => {
  const model = modelFor();
  await model.start();
  const document = documentFor(model);
  const trigger = document.querySelector('.zmem-scope-trigger');
  assert.ok(trigger, 'ZCode 使用胶囊形工作区菜单，不是原生 select');
  assert.match(trigger.textContent, /工作区一/);
  assert.equal(document.querySelector('select'), null);
  assert.equal(document.querySelector('.zmem-count').textContent, '2 条记忆');
  const search = document.querySelector('input[type=search]');
  assert.equal(search.getAttribute('placeholder'), '搜索记忆文件…');
  assert.ok(document.querySelector('button[aria-label="刷新"]'));
  const selected = document.querySelector('.zmem-file[aria-current="true"]');
  assert.equal(selected.textContent.startsWith('MEMORY.md'), true);
  assert.equal(document.querySelector('article h1').textContent, '记忆');
  assert.equal(document.querySelector('article strong').textContent, '只读');
  assert.equal(document.querySelectorAll('textarea,[contenteditable=true]').length, 0);
  assert.equal(document.querySelector('.zmem-preview-badge').textContent, '只读');
});

test('search with no match replaces the file area exactly like ZCode, preview stays', async () => {
  const model = modelFor();
  await model.start();
  model.setQuery('not-found');
  const document = documentFor(model);
  assert.match(document.body.textContent, /没有匹配的记忆文件。/);
  assert.ok(document.querySelector('button[aria-label="清空搜索"]'));
  // ZCode：搜索无结果时整个“文件”标题行+列表被虚线空态替换，刷新按钮随之隐藏
  assert.equal(document.querySelector('.zmem-files-head'), null);
  assert.ok(document.querySelector('article'));
});

test('disabled hides the whole viewer like ZCode; remote and empty show distinct dashed states', async () => {
  const disabled = modelFor({ getSettings: async () => settings({ enabled: false }) });
  await disabled.start();
  const disabledDocument = documentFor(disabled);
  assert.equal(disabledDocument.querySelector('.zmem-viewer'), null);
  assert.equal(disabledDocument.querySelector('.zmem-dashed'), null);
  assert.equal(disabledDocument.querySelector('[role=switch]').getAttribute('aria-checked'), 'false');
  assert.match(disabledDocument.querySelector('[role=switch]').textContent, /开启工作区记忆/);

  const remote = modelFor({ getSettings: async () => settings({ local: false }) });
  await remote.start();
  assert.match(documentFor(remote).querySelector('.zmem-dashed').textContent, /远端连接不读取本地记忆目录/);

  const empty = modelFor({ getWorkspaces: async () => ({ workspaces: [] }) });
  await empty.start();
  assert.match(documentFor(empty).querySelector('.zmem-dashed').textContent, /暂无已保存的工作区记忆/);
});

test('5 MiB rejection is a preview alert; settings failure stays next to the switch with retry', async () => {
  const huge = modelFor({ getWorkspaces: async () => ({ workspaces: [{ id: 'one', label: 'one', updatedAt: 1, files: [file('big.md', MAX_PREVIEW_BYTES + 1)] }] }) });
  await huge.start();
  assert.match(documentFor(huge).querySelector('[role=alert]').textContent, /该记忆文件超过 5 MiB 预览上限/);
  const error = modelFor({ getSettings: async () => { throw new Error('host unavailable'); } });
  await error.start();
  const errorDocument = documentFor(error);
  const inline = errorDocument.querySelector('.zmem-inline-alert[role=alert]');
  assert.match(inline.textContent, /设置读取失败/);
  assert.match(inline.textContent, /host unavailable/);
  assert.equal(inline.querySelector('button[aria-label="重新读取记忆设置"]').disabled, false);
  assert.equal(errorDocument.querySelector('.zmem-viewer'), null);
});

test('Markdown supports frontmatter, headings, lists, table, code and task lists', () => {
  const source = '---\ntype: project\n---\n# 标题\n\n- one\n- **two**\n\n> 引用\n\n|a|b|\n|-|-|\n|1|2|\n\n```js\nconst x = 1;\n```\n\n- [x] 完成';
  const document = new JSDOM(renderToStaticMarkup(h(MarkdownPreview, { content: source }))).window.document;
  assert.equal(document.querySelector('h1').textContent, '标题');
  assert.match(document.querySelector('pre[aria-label="记忆元数据"]').textContent, /type: project/);
  assert.equal(document.querySelectorAll('td').length, 2);
  assert.ok(document.querySelector('blockquote'));
  assert.match(document.querySelector('pre code').textContent, /const x = 1/);
  const task = document.querySelector('input[type=checkbox]');
  assert.equal(task.disabled, true);
  assert.equal(task.checked, true);
});

test('React StrictMode mount supports toggle, capsule menu workspace switch and explicit refresh', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.invalid/' });
  const saved = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  let enabled = false;
  const calls = [];
  const api = {
    getSettings: async () => { calls.push('settings'); return settings({ enabled }); },
    setSettings: async (value) => { enabled = value.enabled; calls.push(`save:${enabled}`); return settings({ enabled }); },
    getWorkspaces: async () => { calls.push('catalog'); return { workspaces: [
      { id: 'one', label: '工作区一', updatedAt: 1000, files: [file('one.md')] },
      { id: 'two', label: '工作区二', updatedAt: 1000, files: [file('two.md')] },
    ] }; },
    getFile: async (id, name) => { calls.push(`file:${id}/${name}`); return { content: `# ${name}`, updatedAt: 1000 }; },
  };
  try {
    await act(async () => { root.render(h(StrictMode, null, h(MemoryPage, { api }))); });
    const document = dom.window.document;
    assert.equal(document.querySelector('[role=switch]').getAttribute('aria-checked'), 'false');
    assert.equal(calls.includes('catalog'), false);
    // ZCode：关闭时浏览区完全不渲染
    assert.equal(document.querySelector('.zmem-viewer'), null);
    await act(async () => { document.querySelector('[role=switch]').click(); });
    assert.equal(document.querySelector('[role=switch]').getAttribute('aria-checked'), 'true');
    assert.equal(document.querySelector('article h1').textContent, 'one.md');
    await act(async () => { document.querySelector('.zmem-scope-trigger').click(); });
    const items = [...document.querySelectorAll('.zmem-menu-item')];
    assert.equal(items.length, 2);
    assert.equal(items[0].getAttribute('aria-checked'), 'true');
    await act(async () => { items[1].click(); });
    assert.equal(document.querySelector('article h1').textContent, 'two.md');
    assert.equal(document.querySelector('.zmem-menu'), null, '选择后菜单关闭');
    calls.length = 0;
    await act(async () => { document.querySelector('button[aria-label="刷新"]').click(); });
    assert.deepEqual(calls, ['settings', 'catalog', 'file:two/two.md']);
    await act(async () => { document.querySelector('[role=switch]').click(); });
    assert.equal(document.querySelector('article'), null);
    assert.equal(document.querySelector('[role=switch]').getAttribute('aria-checked'), 'false');
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act;
    dom.window.close();
  }
});

test('registered bundle and Settings pages share native toggle state and authorized file browsing', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.invalid/' });
  const saved = { window: globalThis.window, document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT, transport: globalThis.__DSH_TRANSPORT__ };
  const requests = [];
  const native = fakeNativeSettings();
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const rpc = {
    async call(channel, endpoint, payload, signal) {
      requests.push({ channel, endpoint, payload, signal });
      const value = endpoint === 'zcode-memory/workspaces'
        ? { workspaces: [{ id: 'one', label: '工作区一', updatedAt: 1000, files: [file('MEMORY.md')] }] }
        : endpoint === 'zcode-memory/file' ? { content: '# saved workspace memory', updatedAt: 1000 }
        : assert.fail('Settings reads/writes must use ConfigForms');
      return { ok: true, value };
    },
  };
  globalThis.__DSH_TRANSPORT__ = { rpc }; // Native client deliberately has NO fetch.
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  let Component, SettingsComponent;
  apply(addNativeContext({ connection: { isLoopback: true, rpc }, slots: {
    inject: (_name, callback) => callback(),
    register: (descriptor, component) => {
      assert.equal(Object.hasOwn(descriptor, 'inject'), false);
      if (descriptor.name === 'plugins.bundle.config') Component = component;
      if (descriptor.name === 'settings.section') SettingsComponent = component;
      return () => {};
    },
  } }, native));
  try {
    await act(async () => { root.render(h(Component, { view: 'summary' })); });
    assert.equal(requests.length, 0);
    assert.match(dom.window.document.body.textContent, /默认关闭/);
    await act(async () => { root.render(h(Component, { view: 'page', api: { getSettings: () => assert.fail('unbound api') } })); });
    const control = dom.window.document.querySelector('[role=switch]');
    assert.equal(control.disabled, false);
    assert.equal(control.getAttribute('aria-checked'), 'false');
    assert.equal(control.textContent, '开启工作区记忆');
    assert.equal(requests.length, 0);
    assert.deepEqual(native.calls, ['describe']);
    await act(async () => { control.click(); });
    assert.equal(native.form.getSnapshot().value.enabled, true);
    assert.deepEqual(native.calls[1], ['set', 'enabled', true]);
    assert.equal(dom.window.document.querySelector('article h1').textContent, 'saved workspace memory');
    assert.equal(requests[0].channel, '/api');
    assert.deepEqual(requests.map(({ endpoint }) => endpoint), ['zcode-memory/workspaces', 'zcode-memory/file']);
    assert.deepEqual(requests[1].payload, { workspaceId: 'one', fileName: 'MEMORY.md' });
    // The real Settings shell supplies only close: the page must explicitly bind page mode.
    await act(async () => { root.render(h(SettingsComponent, { close: () => {} })); });
    assert.equal(dom.window.document.querySelector('[role=switch]').getAttribute('aria-checked'), 'true');
    assert.equal(dom.window.document.querySelector('article h1').textContent, 'saved workspace memory');
    const before = requests.length;
    await act(async () => { dom.window.document.querySelector('button[aria-label="刷新"]').click(); });
    assert.equal(requests.length, before + 2);
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act;
    if (saved.transport === undefined) delete globalThis.__DSH_TRANSPORT__;
    else globalThis.__DSH_TRANSPORT__ = saved.transport;
    dom.window.close();
  }
});

test('malicious Markdown never creates scripts, raw HTML, active links, images or iframes', () => {
  const source = '<script>globalThis.compromised=true</script>\n\n<img src="https://evil.invalid/pixel" onerror="alert(1)">\n\n<iframe src="https://evil.invalid"></iframe>\n\n[execute](javascript:alert%281%29)\n\n![tracking](https://evil.invalid/pixel)\n\n<svg onload="alert(2)"></svg>\n\n**safe**';
  const html = renderToStaticMarkup(h(MarkdownPreview, { content: source }));
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelectorAll('script,img,iframe,svg,a,[onclick],[onerror],[onload]').length, 0);
  assert.match(document.body.textContent, /图片未加载/);
  assert.equal(document.querySelector('strong').textContent, 'safe');
});
