// SPDX-License-Identifier: Apache-2.0
// Layout and zh-CN copy mirror ZCode MemorySettingsSection.tsx / MemorySettingsViewer.tsx
// (Apache-2.0, see NOTICE.md). Deliberate DSH deviations, kept minimal:
// - the textless upstream Switch carries a visually hidden state label because DSH
//   settings can be loading/failed/read-only and must never masquerade as "off";
// - settings/catalog errors render in place (upstream Alert), with an explicit retry;
// - files open an in-page read-only Markdown preview because DSH has no external editor.
// Icons are Lucide (ISC) path data, inlined to avoid a runtime dependency.
import { createElement as h, Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MemoryModel, viewerMode, filterFiles, formatMemoryUpdatedAt,
  SETTINGS_NOTICE, PROVIDER_NOTICE, REMOTE_NOTICE } from './model.js';
import { MarkdownPreview } from './markdown.js';
import { styles } from './styles.js';

function svg(children, size = 16) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': 'true', focusable: 'false' }, children);
}
const IconFolder = () => svg(h('path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }));
const IconChevronDown = () => svg(h('path', { d: 'm6 9 6 6 6-6' }));
const IconSearch = () => svg([h('circle', { key: 'c', cx: 11, cy: 11, r: 8 }), h('path', { key: 'p', d: 'm21 21-4.34-4.34' })]);
const IconX = () => svg([h('path', { key: 'a', d: 'M18 6 6 18' }), h('path', { key: 'b', d: 'm6 6 12 12' })], 14);
const IconRefresh = () => svg([
  h('path', { key: 'a', d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }),
  h('path', { key: 'b', d: 'M21 3v5h-5' }),
  h('path', { key: 'c', d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }),
  h('path', { key: 'd', d: 'M8 16H3v5' })]);
const IconSpinner = () => svg(h('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }));
const IconFile = () => svg([
  h('path', { key: 'a', d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }),
  h('path', { key: 'b', d: 'M14 2v4a2 2 0 0 0 2 2h4' }),
  h('path', { key: 'c', d: 'M10 9H8' }),
  h('path', { key: 'd', d: 'M16 13H8' }),
  h('path', { key: 'e', d: 'M16 17H8' })]);
const IconCheck = () => svg(h('path', { d: 'M20 6 9 17l-5-5' }), 14);

function currentLang() {
  try { return String(globalThis.document?.documentElement?.lang ?? 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en'; }
  catch { return 'zh'; }
}

/** Dashed placeholder box — mirrors ZCode PluginLoadingState/PluginSearchEmptyState geometry. */
function dashed(message, label = '记忆状态提示') {
  return h('div', { className: 'zmem-dashed', role: 'status', 'aria-label': label }, message);
}

/** Workspace capsule trigger + radio dropdown, mirroring ZCode PluginScopeMenu. */
function ScopeMenu({ workspaces, selectedId, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  const selected = workspaces.find((item) => item.id === selectedId);
  return h('div', { className: 'zmem-scope', ref: rootRef },
    h('button', {
      type: 'button', className: 'zmem-scope-trigger', 'aria-haspopup': 'menu',
      'aria-expanded': open, 'aria-label': '选择记忆工作区',
      onClick: () => setOpen((value) => !value),
    },
      h(IconFolder),
      h('span', { className: 'zmem-scope-label' }, selected?.label ?? ''),
      h(IconChevronDown)),
    open ? h('div', { className: 'zmem-menu', role: 'menu', 'aria-label': '工作区' },
      workspaces.map((item) => h('button', {
        type: 'button', key: item.id, role: 'menuitemradio',
        'aria-checked': item.id === selectedId, className: 'zmem-menu-item',
        onClick: () => { setOpen(false); onChange(item.id); },
      },
        h('span', { className: 'zmem-menu-check', 'aria-hidden': 'true' }, item.id === selectedId ? h(IconCheck) : null),
        h(IconFolder),
        h('span', { className: 'zmem-menu-label' }, item.label))))
    : null);
}

function FileList({ model, state, files, now }) {
  const lang = currentLang();
  const rows = [];
  files.forEach((file, index) => {
    if (index > 0) rows.push(h('div', { key: `gap-${file.name}`, className: 'zmem-file-divider', 'aria-hidden': 'true' }));
    rows.push(h('button', {
      type: 'button', key: file.name, className: 'zmem-file',
      'aria-current': state.fileName === file.name ? 'true' : undefined,
      onClick: () => { void model.selectFile(file.name); },
    },
      h('span', { className: 'zmem-file-icon', 'aria-hidden': 'true' }, h(IconFile)),
      h('span', { className: 'zmem-file-text' },
        h('span', { className: 'zmem-file-name' }, file.name),
        h('span', { className: 'zmem-file-time' }, formatMemoryUpdatedAt({ now, updatedAt: file.updatedAt, lang })))));
  });
  return h('div', { className: 'zmem-file-list', 'aria-label': '记忆文件' }, rows);
}

function PreviewPane({ state }) {
  return h('section', { className: 'zmem-preview', 'aria-label': '记忆文件只读预览' },
    h('header', { className: 'zmem-preview-head' },
      h('span', { className: 'zmem-preview-icon', 'aria-hidden': 'true' }, h(IconFile)),
      h('strong', { className: 'zmem-preview-name' }, state.fileName ?? ''),
      h('span', { className: 'zmem-preview-badge' }, '只读')),
    h('div', { className: 'zmem-preview-body', 'aria-busy': state.previewStatus === 'loading' },
      state.previewStatus === 'loading' ? h('p', { className: 'zmem-preview-state' }, '正在加载文件…')
        : state.previewStatus === 'error' ? h('p', { className: 'zmem-preview-state zmem-preview-error', role: 'alert' }, state.previewError)
        : state.previewStatus === 'ready' && state.preview ? h(MarkdownPreview, { content: state.preview.content })
        : h('p', { className: 'zmem-preview-state' }, '选择一个记忆文件以查看内容。')));
}

export function MemoryPage({ api }) {
  const [model] = useState(() => new MemoryModel(api));
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  // ZCode 每 60s 重算一次相对时间；指针只驱动显示，不触发任何请求。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void model.start();
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => { clearInterval(interval); model.dispose(); };
  }, [model]);
  return h(MemoryView, { model, state, now });
}

/** Separate pure view allows DOM checks without any DSH or network dependency. */
export function MemoryView({ model, state, now }) {
  const currentTime = typeof now === 'number' ? now : Date.now();
  const rawMode = viewerMode(state);
  // ZCode 只在“加载中且还没有任何目录”时替换整个 viewer；刷新期间保留现有列表。
  const mode = rawMode === 'loading' && state.workspaces.length > 0 ? 'ready' : rawMode;
  const workspace = state.workspaces.find((item) => item.id === state.workspaceId);
  const visibleFiles = filterFiles(workspace?.files ?? [], state.query);
  const refreshing = state.catalogStatus === 'loading';
  const busy = state.saving || refreshing;
  const loadingSettings = state.settingsStatus === 'idle' || state.settingsStatus === 'loading';
  const failedSettings = state.settingsStatus === 'error';
  const readOnlySettings = state.settingsStatus === 'ready' && state.settings.writable === false;
  const switchDisabled = state.saving || state.settingsStatus !== 'ready' || readOnlySettings;
  const switchText = state.saving ? '保存中…' : loadingSettings ? '读取设置…' : failedSettings
    ? '设置读取失败' : state.settings.enabled ? '关闭工作区记忆' : '开启工作区记忆';

  let viewer = null;
  if (failedSettings) viewer = null; // 失败原因与重试已经在开关卡片内就地展示
  else if (mode === 'loading') viewer = dashed('正在加载记忆…');
  else if (mode === 'remote') viewer = dashed(REMOTE_NOTICE);
  else if (mode === 'disabled') viewer = null; // 与 ZCode 一致：关闭时不渲染浏览区
  else if (mode === 'error') viewer = h('div', { className: 'zmem-alert-box', role: 'alert' }, state.catalogError ?? '无法读取记忆，请显式刷新后重试。');
  else if (mode === 'empty') viewer = dashed('暂无已保存的工作区记忆');
  else {
    const searchEmpty = Boolean(state.query.trim()) && visibleFiles.length === 0;
    viewer = h('section', { className: 'zmem-viewer', 'aria-label': '本地工作区记忆浏览器' },
      h('div', { className: 'zmem-bar' },
        h('div', { className: 'zmem-bar-side' },
          h(ScopeMenu, {
            workspaces: state.workspaces, selectedId: state.workspaceId,
            onChange: (id) => { void model.selectWorkspace(id); },
          }),
          h('span', { className: 'zmem-bar-divider', 'aria-hidden': 'true' }),
          h('span', { className: 'zmem-count', role: 'status' }, `${workspace?.files.length ?? 0} 条记忆`)),
        h('div', { className: 'zmem-bar-side zmem-bar-end' },
          h('div', { className: 'zmem-searchbox' },
            h('span', { className: 'zmem-search-icon', 'aria-hidden': 'true' }, h(IconSearch)),
            h('input', {
              type: 'search', value: state.query, placeholder: '搜索记忆文件…',
              'aria-label': '搜索记忆文件',
              onChange: (event) => model.setQuery(event.target.value),
            }),
            state.query ? h('button', {
              type: 'button', className: 'zmem-search-clear', 'aria-label': '清空搜索',
              onClick: () => model.setQuery(''),
            }, h(IconX)) : null))),
      searchEmpty
        ? dashed('没有匹配的记忆文件。', '搜索记忆文件结果')
        : h(Fragment, null,
            h('div', { className: 'zmem-files-head' },
              h('h3', null, '文件'),
              h('button', {
                type: 'button', className: 'zmem-icon-btn', 'aria-label': '刷新', title: '刷新',
                disabled: busy, onClick: () => { void model.refresh(); },
              }, h('span', { className: refreshing ? 'zmem-spin' : undefined },
                refreshing ? h(IconSpinner) : h(IconRefresh)))),
            h(FileList, { model, state, files: visibleFiles, now: currentTime })),
      state.fileName ? h(PreviewPane, { state }) : null);
  }

  return h('div', { className: 'zmem', 'data-zcode-memory-unified': true },
    h('style', null, styles),
    h('section', { className: 'zmem-card', 'aria-label': '工作区记忆设置' },
      h('div', { className: 'zmem-row' },
        h('div', { className: 'zmem-row-text' },
          h('div', { className: 'zmem-row-title' }, '工作区记忆'),
          h('div', { className: 'zmem-row-desc' }, SETTINGS_NOTICE),
          h('div', { className: 'zmem-row-note' }, PROVIDER_NOTICE),
          failedSettings ? h('div', { className: 'zmem-inline-alert', role: 'alert' },
            `设置读取失败：${state.settingsError ?? '请重试'}`,
            h('button', {
              type: 'button', className: 'zmem-link-btn', 'aria-label': '重新读取记忆设置',
              onClick: () => { void model.refresh(); },
            }, '重新读取设置')) : null,
          readOnlySettings ? h('div', { className: 'zmem-inline-note' },
            '当前 DSH 配置为只读，不能更改记忆开关；已有记忆仍可按权限浏览。') : null,
          state.saveError ? h('div', { className: 'zmem-inline-alert', role: 'alert' },
            `设置未保存：${state.saveError}`) : null),
        h('button', {
          type: 'button', role: 'switch', className: 'zmem-switch', 'aria-label': '工作区记忆',
          'aria-checked': state.settings.enabled, disabled: switchDisabled,
          onClick: () => { void model.setEnabled(!state.settings.enabled); },
        },
          h('span', { className: 'zmem-switch-thumb', 'aria-hidden': 'true' }),
          h('span', { className: 'zmem-sr-only' }, switchText)))),
    viewer);
}

export function MemoryConfig({ view, api }) {
  return view === 'summary' ? 'ZCode 风格的工作区记忆：默认关闭、按会话生效、本地文件只读浏览。' : h(MemoryPage, { api });
}
