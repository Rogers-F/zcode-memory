'use strict';

const unified = require('../shared.cjs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { LIMITS } = require('./constants');
const safe = require('./fs-safe');
const memory = require('./memory');
const agent = require('./agent');
const { formatMemoryUpdatedAt, SETTING_TYPES } = require('./core');

const PROJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,120}$/u;

function projectDir(storageRoot, projectKey) {
  if (!PROJECT_KEY_PATTERN.test(String(projectKey || ''))) throw new Error('invalid project key');
  return path.join(storageRoot, 'memories', 'projects', projectKey);
}

function personalMemoryRoot(storageRoot){return unified.storePath({home:path.join(storageRoot,'scopes'),host:'pi-desktop',project:'personal',scope:'personal'}).root;}
function memoryRootOf(storageRoot, projectKey) {
  if(projectKey==='personal')return personalMemoryRoot(storageRoot);
  return path.join(projectDir(storageRoot, projectKey), 'memory');
}

async function readProjectMeta(storageRoot, projectKey) {
  const meta = await safe.readJson(path.join(projectDir(storageRoot, projectKey), 'project.json'), null);
  return meta && typeof meta === 'object' ? meta : {};
}

async function writeProjectMeta(storageRoot, projectKey, meta) {
  const dir = projectDir(storageRoot, projectKey);
  await fsp.mkdir(dir, { recursive: true });
  await safe.writeJson(path.join(dir, 'project.json'), { ...meta, key: projectKey, updatedAt: Date.now() });
}

async function listProjects(storageRoot) {
  const root = path.join(storageRoot, 'memories', 'projects');
  let entries;
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    entries=[];
  }
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !PROJECT_KEY_PATTERN.test(entry.name)) continue;
    const memoryRoot = path.join(root, entry.name, 'memory');
    let files;
    try {
      files = await fsp.readdir(memoryRoot);
    } catch {
      continue;
    }
    const memoryFiles = files.filter((name) => name.endsWith('.md') && name !== 'MEMORY.md');
    let indexStat;
    try {
      indexStat = await fsp.lstat(path.join(memoryRoot, 'MEMORY.md'));
    } catch {
      indexStat = undefined;
    }
    const meta = await readProjectMeta(storageRoot, entry.name);
    const stats = await Promise.all(memoryFiles.slice(0, 50).map(async (name) => {
      try {
        return (await fsp.lstat(path.join(memoryRoot, name))).mtimeMs;
      } catch {
        return 0;
      }
    }));
    projects.push({
      key: entry.name,
      name: meta.workspacePath ? path.basename(meta.workspacePath) || entry.name : entry.name,
      workspacePath: typeof meta.workspacePath === 'string' ? meta.workspacePath : '',
      memoryRoot,
      count: memoryFiles.length,
      hasIndex: Boolean(indexStat && indexStat.isFile()),
      updatedAt: Math.max(0, ...stats),
    });
  }
  const personalRoot=personalMemoryRoot(storageRoot),personal=await new unified.MemoryStore({root:personalRoot,host:'pi-desktop',project:'personal',scope:'personal'}).catalog();
  projects.push({key:'personal',name:'个人偏好（跨项目）',scope:'personal',workspacePath:'',memoryRoot:personalRoot,count:personal.facts.length,hasIndex:personal.facts.length>0,updatedAt:0});
  projects.sort((left, right) => right.updatedAt - left.updatedAt || left.key.localeCompare(right.key));
  return projects;
}

async function listFiles(input) {
  const memoryRoot = memoryRootOf(input.storageRoot, input.projectKey);
  const manifest = await memory.scanMemoryManifest({ rootDir: memoryRoot });
  const byFilename = new Map(manifest.map((entry) => [entry.filename, entry]));
  const files = await safe.listFilesInside(memoryRoot);
  const now = input.now ?? Date.now();
  const rows = files
    .filter((file) => file.rel.endsWith('.md'))
    .map((file) => {
      const entry = byFilename.get(file.rel);
      return {
        rel: file.rel,
        name: path.basename(file.rel),
        size: file.size,
        mtimeMs: file.mtimeMs,
        updatedAt: formatMemoryUpdatedAt({ now, updatedAt: file.mtimeMs }),
        isIndex: file.rel === 'MEMORY.md',
        type: entry?.type || '',
        description: entry?.description || '',
      };
    });
  const query = String(input.query || '').trim().toLowerCase();
  const filtered = query
    ? rows.filter((row) => row.rel.toLowerCase().includes(query) || row.description.toLowerCase().includes(query))
    : rows;
  filtered.sort((left, right) => (left.isIndex === right.isIndex ? right.mtimeMs - left.mtimeMs : left.isIndex ? -1 : 1));
  return filtered;
}

async function readFilePreview(input) {
  const memoryRoot = memoryRootOf(input.storageRoot, input.projectKey);
  if (!/\.md$/iu.test(String(input.rel || ''))) throw new Error('only .md files are previewable');
  const { content, stat } = await safe.readFileInside(memoryRoot, input.rel, { maxBytes: LIMITS.PREVIEW_MAX_BYTES });
  const normalized = memory.normalizeText(content);
  return {
    rel: input.rel,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    content: normalized,
    truncated: stat.size > 200000 ? `${normalized.slice(0, 200000)}\n\n…(预览截断)` : normalized,
  };
}

async function status(input) {
  const projects = await listProjects(input.storageRoot);
  const storeStatus = input.store ? await input.store.readStatus() : {};
  return {
    projects,
    settings: input.settings,
    platform: process.platform,
    storageRoot: input.storageRoot,
    limits: {
      previewMaxBytes: LIMITS.PREVIEW_MAX_BYTES,
      indexLineLimit: LIMITS.MEMORY_INDEX_LINE_LIMIT,
      manifestFileLimit: LIMITS.MANIFEST_FILE_LIMIT,
      recallSessionCharacters: LIMITS.MEMORY_RECALL_SESSION_CHARACTER_LIMIT,
    },
    extraction: storeStatus.extraction || { state: 'idle' },
    dream: storeStatus.dream || { state: 'idle' },
    dreamAuto: storeStatus.dreamAuto || null,
    recall: storeStatus.recall || { state: 'idle' },
    rateLimit: storeStatus.rateLimit || null,
    model: storeStatus.model || { state: 'unknown' },
    taskRewrite: input.store ? await input.store.readTaskRewrite() : null,
    archive: storeStatus.archive || { count: 0 },
    updatedAt: Date.now(),
  };
}

/**
 * 面板后端。所有通道都只接受明确的参数，路径必须落在记忆根内。
 */
function createPanelApi(options) {
  const storageRoot = options.storageRoot;
  const getSettings = options.getSettings;
  const setSettings = options.setSettings;
  const runDream = options.runDream;
  const runExtraction = options.runExtraction;
  const store = options.store;

  const managed = payload => new unified.MemoryStore({root:memoryRootOf(storageRoot,payload.projectKey),host:'pi-desktop',project:payload.originProject??payload.projectKey,scope:payload.projectKey==='personal'?'personal':'project'});
  const handlers = {
    async 'memory.save'(payload){const target=['user','feedback'].includes(payload.type)?managed({...payload,projectKey:'personal',originProject:payload.projectKey}):managed(payload);return {...await target.save({body:payload.body,type:payload.type||'project',path:payload.path},{session:'panel'}),scope:target.scope};},
    async 'memory.forget'(payload){const result=await managed(payload).forget(payload.path,{session:'panel',purge:payload.purge===true});if(payload.purge===true)result.legacyPurged=await agent.purgePathArchives({storageRoot,projectKey:payload.projectKey,filePath:unified.relativeFile(memoryRootOf(storageRoot,payload.projectKey),payload.path).full});return result;},
    async 'memory.repair'(payload){return managed(payload).repair(payload.path,{action:payload.action,session:'panel'});},
    async 'memory.stats'(payload){const s=await managed(payload).catalog();return {settings:s.settings,stats:s.stats,archives:s.archives,index:s.index};},
    async 'memory.restore'(payload){return managed(payload).restore(payload.archiveId,{session:'panel'});},
    async 'status.get'() {
      const settings = await getSettings();
      return status({ storageRoot, settings, store });
    },
    async 'projects.list'() {
      return { projects: await listProjects(storageRoot) };
    },
    async 'files.list'(payload) {
      return { files: await listFiles({ storageRoot, projectKey: payload.projectKey, query: payload.query }) };
    },
    async 'file.read'(payload) {
      return { file: await readFilePreview({ storageRoot, projectKey: payload.projectKey, rel: payload.rel }) };
    },
    async 'archive.list'(payload) {
      const snapshot=await managed(payload).catalog();
      const current=Object.entries(snapshot.archives).map(([id,value])=>({...value,rel:value.path,archiveId:id,deletionDate:value.at,archivedAt:Date.parse(value.at),managed:true}));
      return { entries: [...current,...await agent.listArchive({ storageRoot, projectKey: payload.projectKey })].sort((a,b)=>b.archivedAt-a.archivedAt) };
    },
    async 'archive.restore'(payload) {
      if(payload.archiveId)return managed(payload).restore(payload.archiveId,{session:'panel-restore'});
      const result = await agent.restoreArchiveEntry({ storageRoot, projectKey: payload.projectKey, rel: payload.rel });
      return { ok: true, ...result };
    },
    async 'archive.purge'(payload) {
      return agent.purgeArchiveEntry({ storageRoot, projectKey: payload.projectKey, rel: payload.rel });
    },
    async 'dream.run'(payload) {
      const result = await runDream(payload.projectKey);
      return { ok: true, ...result };
    },
    async 'extract.now'(payload) {
      const result = await runExtraction(payload.projectKey);
      return { ok: true, ...result };
    },
    async 'settings.set'(payload) {
      const key = String(payload.key || '');
      const value = payload.value;
      if (!Object.hasOwn(SETTING_TYPES, key)) throw new Error('unknown setting: ' + key);
      if (typeof value !== SETTING_TYPES[key]) throw new Error('setting ' + key + ' expects ' + SETTING_TYPES[key]);
      await setSettings(key, value);
      return { ok: true, settings: await getSettings() };
    },
  };

  return {
    async invoke(channel, payload) {
      const handler = handlers[channel];
      if (!handler) {
        const error = new Error(`unknown panel channel: ${channel}`);
        error.code = 'UNSUPPORTED';
        throw error;
      }
      return handler(payload && typeof payload === 'object' ? payload : {});
    },
  };
}

module.exports = {
  PROJECT_KEY_PATTERN,
  projectDir,
  memoryRootOf,
  readProjectMeta,
  writeProjectMeta,
  listProjects,
  listFiles,
  readFilePreview,
  status,
  createPanelApi,
};
