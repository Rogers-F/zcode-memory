// SPDX-License-Identifier: Apache-2.0
// Adapted from ZCode packages/ui/src/settings/MemorySettingsSection.tsx and
// MemorySettingsViewer.tsx (Apache-2.0). Modifications: DSH host API, explicit
// read-only preview, fail-closed remote gating and cancellable request epochs.

export const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
// Switch row description mirrors ZCode zh-CN `settings.memoryDescription` verbatim.
export const SETTINGS_NOTICE = '在工作区中保存并复用长期上下文，新会话生效。开启后可能增加模型调用和 Token 成本。';
// DSH-specific disclosure kept next to the switch: the provider boundary must stay explicit.
export const PROVIDER_NOTICE = '记忆保存在本机 DSH 私有目录，默认项目记忆不修改工作区项目文件；提取与回忆会把相关对话和记忆内容发送给你选择的模型服务商，并非所有内容都永不离开本机。关闭不会删除已有记忆。';
export const REMOTE_NOTICE = '远端连接不读取本地记忆目录。请在运行该工作区的本地 DSH 中查看记忆；不会回退访问浏览器所在机器的 localhost。';

export class MemoryClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MemoryClientError';
    this.code = code;
  }
}

const ERROR_TEXT = {
  // 文件级文案与 ZCode zh-CN settings.memory.viewer.file* 逐字一致。
  FILE_TOO_LARGE: '该记忆文件超过 5 MiB 预览上限。',
  FILE_CHANGED: '该记忆文件在读取期间已更新，请重新打开或刷新文件列表。',
  FILE_NOT_FOUND: '该记忆文件已被删除，请刷新文件列表。',
  INVALID_PATH: '文件路径不安全或存在符号链接、路径遍历、大小写别名，已拒绝访问。',
  LOCAL_ONLY: REMOTE_NOTICE,
  MEMORY_DISABLED: '工作区记忆已关闭。开启后可查看已有文件，关闭不会删除数据。',
  UNAUTHORIZED: 'DSH 授权已失效，请重新连接后刷新。',
  INVALID_RESPONSE: '记忆服务返回了无法识别的数据，请检查插件版本后刷新。',
};

export function errorMessage(error) {
  return ERROR_TEXT[error?.code] ?? (error instanceof Error ? error.message : String(error));
}

export function filterFiles(files, query) {
  const needle = query.trim().toLocaleLowerCase();
  return files.filter((file) => file.name.toLocaleLowerCase().includes(needle));
}

// Ported from ZCode packages/ui/src/settings/memoryUpdatedAt.ts (Apache-2.0):
// same thresholds (1 分钟/30 分钟/今天/昨天/本周) and zh-CN/en-US wording.
const MINUTE_MS = 60_000;
const RELATIVE_MINUTES_LIMIT = 30;
const WEEKDAY_ZH = '日一二三四五六';
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfLocalDay(timestamp) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatClock(timestamp) {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatMemoryUpdatedAt({ now, updatedAt, lang = 'zh' }) {
  const zh = lang !== 'en';
  const elapsedMs = now - updatedAt;
  if (!Number.isFinite(updatedAt) || Number.isNaN(elapsedMs) || elapsedMs < MINUTE_MS) {
    return zh ? '刚刚' : 'Just now';
  }
  const elapsedMinutes = Math.floor(elapsedMs / MINUTE_MS);
  if (elapsedMinutes < RELATIVE_MINUTES_LIMIT) {
    return zh ? `${elapsedMinutes} 分钟前` : `${elapsedMinutes} min ago`;
  }
  const time = formatClock(updatedAt);
  const todayStart = startOfLocalDay(now);
  const updatedDayStart = startOfLocalDay(updatedAt);
  if (updatedDayStart === todayStart) return zh ? `今天 ${time}` : `Today ${time}`;
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (updatedDayStart === yesterdayStart.getTime()) return zh ? `昨天 ${time}` : `Yesterday ${time}`;
  const today = new Date(todayStart);
  const weekStart = new Date(todayStart);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (updatedDayStart >= weekStart.getTime()) {
    const weekday = new Date(updatedAt).getDay();
    return zh ? `周${WEEKDAY_ZH[weekday] ?? ''} ${time}` : `${WEEKDAY_EN[weekday]} ${time}`;
  }
  const date = new Date(updatedAt);
  const includeYear = date.getFullYear() !== today.getFullYear();
  if (zh) {
    return includeYear
      ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${time}`
      : `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${time}`;
  }
  return includeYear
    ? `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`
    : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

export function viewerMode(state) {
  if (state.settingsStatus === 'loading' || state.settingsStatus === 'idle') return 'loading';
  if (state.settingsStatus === 'error') return 'error';
  if (!state.settings.local) return 'remote';
  if (!state.settings.enabled) return 'disabled';
  if (state.saving) return 'loading';
  if (state.catalogStatus === 'error') return 'error';
  if (state.catalogStatus === 'loading') return 'loading';
  return state.workspaces.length ? 'ready' : 'empty';
}

/** A pure observable model; only the injected API may access the DSH host. */
export class MemoryModel {
  constructor(api) {
    this.api = api;
    this.listeners = new Set();
    this.requests = new Map();
    this.disposed = false;
    this.state = {
      settings: { enabled: false, local: false, sessionScoped: true, branch: 'default-index' },
      settingsStatus: 'idle', settingsError: null, saving: false, saveError: null,
      catalogStatus: 'idle', catalogError: null, workspaces: [], workspaceId: null,
      fileName: null, query: '', previewStatus: 'idle', previewError: null, preview: null,
    };
  }

  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  patch(values) {
    if (this.disposed) return;
    this.state = { ...this.state, ...values };
    for (const listener of this.listeners) listener();
  }

  cancel(...keys) {
    for (const key of keys) {
      this.requests.get(key)?.abort();
      this.requests.delete(key);
    }
  }

  begin(key) {
    this.cancel(key);
    const controller = new AbortController();
    this.requests.set(key, controller);
    return {
      signal: controller.signal,
      current: () => !this.disposed && this.requests.get(key) === controller && !controller.signal.aborted,
    };
  }

  clearViewer() {
    this.cancel('catalog', 'preview');
    this.patch({ catalogStatus: 'idle', catalogError: null, workspaces: [], workspaceId: null,
      fileName: null, previewStatus: 'idle', previewError: null, preview: null });
  }

  async start() {
    this.disposed = false;
    return this.refresh();
  }

  dispose() {
    this.disposed = true;
    this.cancel('settings', 'catalog', 'preview', 'save');
  }

  async refresh() {
    if (this.disposed || this.state.saving) return;
    this.cancel('catalog', 'preview');
    const request = this.begin('settings');
    this.patch({ settingsStatus: 'loading', settingsError: null, saveError: null,
      previewStatus: 'idle', previewError: null, preview: null });
    try {
      const settings = await this.api.getSettings(request.signal);
      if (!request.current()) return;
      this.patch({ settings, settingsStatus: 'ready' });
      if (settings.enabled && settings.local) await this.loadCatalog();
      else this.clearViewer();
    } catch (error) {
      if (!request.current()) return;
      this.clearViewer();
      this.patch({ settingsStatus: 'error', settingsError: errorMessage(error) });
    }
  }

  async setEnabled(enabled) {
    if (this.disposed || this.state.saving || this.state.settingsStatus !== 'ready' || this.state.settings.writable === false) return;
    this.cancel('settings');
    this.clearViewer();
    const request = this.begin('save');
    this.patch({ saving: true, saveError: null });
    try {
      const settings = await this.api.setSettings({ enabled }, request.signal);
      if (!request.current()) return;
      this.patch({ settings, saving: false });
      if (settings.enabled && settings.local) await this.loadCatalog();
    } catch (error) {
      if (!request.current()) return;
      this.patch({ saving: false, saveError: errorMessage(error) });
      // No optimistic setting changes; the accepted host value remains visible.
      if (this.state.settings.enabled && this.state.settings.local) await this.loadCatalog();
    }
  }

  async loadCatalog() {
    if (this.disposed || !this.state.settings.enabled || !this.state.settings.local) return;
    const request = this.begin('catalog');
    this.patch({ catalogStatus: 'loading', catalogError: null });
    try {
      const { workspaces } = await this.api.getWorkspaces(request.signal);
      if (!request.current()) return;
      const workspace = workspaces.find((item) => item.id === this.state.workspaceId) ?? workspaces[0];
      const file = workspace?.files.find((item) => item.name === this.state.fileName) ?? workspace?.files[0];
      this.patch({ workspaces, catalogStatus: 'ready', workspaceId: workspace?.id ?? null,
        fileName: null, preview: null, previewError: null, previewStatus: 'idle' });
      if (file) await this.selectFile(file.name);
    } catch (error) {
      if (!request.current()) return;
      this.clearViewer();
      this.patch({ catalogStatus: 'error', catalogError: errorMessage(error) });
    }
  }

  setQuery(query) { this.patch({ query }); }

  async selectWorkspace(id) {
    if (this.disposed || !this.state.settings.enabled || !this.state.settings.local || this.state.saving) return;
    const workspace = this.state.workspaces.find((item) => item.id === id);
    if (!workspace) return;
    this.cancel('preview');
    // ZCode 切换工作区时保留搜索词；预览切换到新工作区的第一个文件。
    this.patch({ workspaceId: id, fileName: null, preview: null,
      previewStatus: 'idle', previewError: null });
    if (workspace.files[0]) await this.selectFile(workspace.files[0].name);
  }

  async selectFile(name) {
    if (this.disposed || !this.state.settings.enabled || !this.state.settings.local || this.state.saving) return;
    const workspace = this.state.workspaces.find((item) => item.id === this.state.workspaceId);
    const file = workspace?.files.find((item) => item.name === name);
    if (!file) return;
    const request = this.begin('preview');
    this.patch({ fileName: name, preview: null, previewError: null, previewStatus: 'loading' });
    try {
      if (file.size > MAX_PREVIEW_BYTES) throw new MemoryClientError('FILE_TOO_LARGE', 'File exceeds 5 MiB');
      const preview = await this.api.getFile(workspace.id, name, request.signal);
      if (!request.current()) return;
      // Defense in depth: the host is responsible for its stable-handle byte limit.
      if (new TextEncoder().encode(preview.content).byteLength > MAX_PREVIEW_BYTES) {
        throw new MemoryClientError('FILE_TOO_LARGE', 'File exceeds 5 MiB');
      }
      this.patch({ previewStatus: 'ready', preview });
    } catch (error) {
      if (!request.current()) return;
      this.patch({ previewStatus: 'error', previewError: errorMessage(error), preview: null });
    }
  }
}
