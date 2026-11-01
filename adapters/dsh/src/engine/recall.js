/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode memory/recall/{index,selector,manifest}.ts,
 * memory/project-memory-retrieval-branch.ts and runtime/helpers/project-memory-recall.ts.
 * Modifications: normalized storage/model/read-state seams and explicit lifecycle interface.
 * The semantic branch remains disabled by the fixed production constant below.
 */
import { resolve } from 'node:path';
import { buildMemorySelectorRequest, formatMemoryManifest, formatRelevantMemoryAttachment } from '../prompts.js';
import { auxiliaryModelOptions, cloneValue, findReadState, forwardAbort, pathKey, textContent } from './common.js';

export const ENABLE_PROJECT_MEMORY_SEMANTIC_RECALL = false;
export const MEMORY_RECALL_SESSION_CHARACTER_LIMIT = 61_440;
export const PROJECT_MEMORY_SEMANTIC_RECALL_ENABLED = ENABLE_PROJECT_MEMORY_SEMANTIC_RECALL;
export function resolveProjectMemoryRetrievalBranch(enabled = PROJECT_MEMORY_SEMANTIC_RECALL_ENABLED) { return enabled ? 'semantic-recall' : 'default-index'; }
export const ACTIVE_PROJECT_MEMORY_RETRIEVAL_BRANCH = resolveProjectMemoryRetrievalBranch();
export function createMemoryRecallState() { return { recalledContentCharacters: 0, recalledPaths: new Set() }; }
export function canStartMemoryRecall(state) { return state.recalledContentCharacters < MEMORY_RECALL_SESSION_CHARACTER_LIMIT; }
export function recordRecalledMemories(state, memories) {
  for (const memory of memories) { state.recalledPaths.add(memory.filePath); state.recalledContentCharacters += memory.content.length; }
}
export function findLatestMemoryRecallQuery(entries) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry.kind === 'attachment') continue;
    const message = entry.message ?? entry;
    if (message.role !== 'user' || message.toolCallId || message.toolName) continue;
    const text = textContent(message.content);
    if (entry.metadata) { if (entry.metadata.source !== 'real_user') continue; }
    else if (text.trimStart().startsWith('<system-reminder>')) continue;
    return text;
  }
}
export function isMemoryRecallQueryEligible(query) { return !!query && /\s/u.test(query.trim()); }
export async function getMemoryRecallManifest({ storage, state, signal }) {
  if (state.manifest?.length) return state.manifest;
  const manifest = await storage.manifest({ signal });
  if (signal?.aborted) return [];
  if (manifest.length) {
    state.manifest = manifest;
    state.selectorMessages = [{ role: 'user', content: `Available memories:\n${formatMemoryManifest(manifest)}`, cacheControl: { type: 'ephemeral' } }];
  }
  return manifest;
}
const emptySelection = () => ({ selectedKnowledgeIds: [], selectedMemories: [] });
export async function runMemorySelector({ model, query, state, abortSignal }) {
  if (!state.manifest?.length || state.manifest.every(entry => state.recalledPaths.has(entry.filePath))) return emptySelection();
  try {
    const request = buildMemorySelectorRequest({ query, state });
    const response = await model.generateText({ ...request, abortSignal, options: { ...request.options, ...auxiliaryModelOptions(model) } });
    if (abortSignal?.aborted) return emptySelection();
    const parsed = JSON.parse(response.text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptySelection();
    if (Object.keys(parsed).some(key => !['selected_memories', 'selected_knowledge_ids'].includes(key))) return emptySelection();
    const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string');
    if (!strings(parsed.selected_memories) || (parsed.selected_knowledge_ids !== undefined && !strings(parsed.selected_knowledge_ids))) return emptySelection();
    const conversation = state.selectorMessages ?? [{ role: 'user', content: `Available memories:\n${formatMemoryManifest(state.manifest)}`, cacheControl: { type: 'ephemeral' } }];
    state.selectorMessages = [...conversation, { role: 'user', content: `Select memories relevant to:\n${query}` }, { role: 'assistant', content: response.text }];
    return { selectedMemories: [...parsed.selected_memories], selectedKnowledgeIds: [...(parsed.selected_knowledge_ids ?? [])] };
  } catch { return emptySelection(); }
}
/** Do not deduplicate: source keeps selection order and repeated filenames, then limits to five. */
export function filterMemorySelections({ manifest, readFileState, readState = readFileState, recalledPaths, selectedFilenames }) {
  const byFilename = new Map(manifest.map(entry => [entry.filename, entry]));
  return selectedFilenames.map(name => byFilename.get(name)).filter(Boolean).filter(entry => !findReadState(readState, entry.filePath)).filter(entry => !recalledPaths.has(entry.filePath)).slice(0, 5);
}

/** Dormant implementation. Hosts use the fixed branch resolver; tests can explicitly exercise this seam. */
export function createMemoryRecall({ storage, readState = new Map(), now = Date.now, recordRead, onError = () => {} }) {
  let state = createMemoryRecallState();
  let prefetch;
  function dispose() {
    const pending = prefetch;
    prefetch = undefined;
    if (!pending) return;
    pending.detach();
    pending.controller.abort();
  }
  return {
    getState: () => state,
    /** Starts but never waits. Call consume only after an entire foreground tool batch. */
    start({ model, messages, entries = messages, query = findLatestMemoryRecallQuery(entries ?? []), turnAbortSignal, branch = resolveProjectMemoryRetrievalBranch() }) {
      if (branch !== 'semantic-recall' || prefetch || !model.properties?.supportsJsonSchemaOutput || !canStartMemoryRecall(state) || !isMemoryRecallQueryEligible(query)) return false;
      if (state.manifest?.length && state.manifest.every(entry => state.recalledPaths.has(entry.filePath))) return false;
      const controller = new AbortController();
      const pending = { controller, consumed: false, settled: false, memories: [], detach: forwardAbort(turnAbortSignal, controller) };
      prefetch = pending;
      const readSnapshot = cloneValue(readState);
      const recalledSnapshot = new Set(state.recalledPaths);
      const recallState = state;
      pending.promise = (async () => {
        const signal = controller.signal;
        const manifest = await getMemoryRecallManifest({ storage, state: recallState, signal });
        if (signal.aborted || manifest.every(entry => recalledSnapshot.has(entry.filePath))) return [];
        const selection = await runMemorySelector({ model, query, state: recallState, abortSignal: signal });
        if (signal.aborted) return [];
        const entries = filterMemorySelections({ manifest, readState: readSnapshot, recalledPaths: recalledSnapshot, selectedFilenames: selection.selectedMemories });
        const memories = await storage.readRecalledMemories({ entries, nowMs: now(), signal });
        if (signal.aborted) return [];
        const byPath = new Map(entries.map(entry => [entry.filePath, entry]));
        return memories.flatMap(memory => byPath.has(memory.filePath) ? [{ entry: byPath.get(memory.filePath), memory }] : []);
      })().then(memories => { if (!controller.signal.aborted) pending.memories = memories; }).catch(error => { try { onError(error); } catch {} }).finally(() => { pending.settled = true; pending.detach(); });
      return true;
    },
    consume({ branch = resolveProjectMemoryRetrievalBranch() } = {}) {
      if (branch !== 'semantic-recall' || !prefetch?.settled || prefetch.consumed || prefetch.controller.signal.aborted) return;
      prefetch.consumed = true;
      const eligible = filterMemorySelections({ manifest: state.manifest ?? prefetch.memories.map(item => item.entry), readState, recalledPaths: state.recalledPaths, selectedFilenames: prefetch.memories.map(item => item.entry.filename) });
      const queues = new Map();
      for (const item of prefetch.memories) { const queue = queues.get(item.entry.filename) ?? []; queue.push(item.memory); queues.set(item.entry.filename, queue); }
      const memories = eligible.flatMap(entry => { const memory = queues.get(entry.filename)?.shift(); return memory ? [memory] : []; });
      if (!memories.length) return;
      for (const memory of memories) {
        // Intentional safety divergence: source stores isPartialView:false even for truncated recall.
        // Mark previews partial so an unchanged revision cannot authorize a full-file overwrite
        // after the model saw only 200 lines/4096 bytes. A complete Read restores that capability.
        const entry = { ...memory, path: memory.filePath, isPartialView: memory.limit !== undefined, offset: undefined, readAt: new Date(now()), mtimeMs: Math.trunc(memory.mtimeMs), revision: memory.revisionId ? { id: memory.revisionId } : undefined };
        if (recordRead) recordRead(readState, entry);
        else readState.set(process.platform === 'win32' ? resolve(memory.filePath).toLowerCase() : resolve(memory.filePath), entry);
      }
      recordRecalledMemories(state, memories);
      return { kind: 'attachment', name: 'relevant_memory', content: formatRelevantMemoryAttachment(memories), memories };
    },
    dispose,
    reset() { dispose(); state = createMemoryRecallState(); },
    invalidate(paths) {
      if (!paths.length) return;
      dispose();
      const keys = new Set(paths.map(pathKey));
      for (const [key, entry] of readState) if (keys.has(pathKey(entry.path ?? entry.filePath ?? key))) readState.delete(key);
      for (const path of state.recalledPaths) if (keys.has(pathKey(path))) state.recalledPaths.delete(path);
      state.manifest = undefined;
      state.selectorMessages = undefined;
    },
    /** Explicit synchronization for tests/host shutdown, never used on the foreground request path. */
    async drain() { await prefetch?.promise; },
  };
}
