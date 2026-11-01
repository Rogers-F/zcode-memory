/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode memory/dream.ts and runtime/helpers/project-memory-dream.ts.
 * Modifications: explicit host-independent invocation, injected transcript/lock adapters, abort support.
 * No automatic trigger is installed. Mutation attempts (not just successful writes) count as touched.
 */
import { basename, resolve } from 'node:path';
import { buildMemoryDreamPrompt } from '../prompts.js';
import { captureMemorySnapshot, findReadState, forwardAbort, throwIfAborted } from './common.js';
import { runMemoryAgentLoop } from './agent-loop.js';
import { collectDreamTouchedPaths } from './tool-policy.js';

export const DREAM_MAX_TURNS = 50;
export const DREAM_MINIMUM_TRANSCRIPT_SESSIONS = 5;
export function evaluateAutoDreamTiming({ lastConsolidatedAtMs, lastScanAtMs, nowMs }) {
  if (nowMs - lastConsolidatedAtMs < 24 * 60 * 60 * 1000) return { decision: 'skip', reason: 'minimum-interval' };
  if (nowMs - lastScanAtMs < 10 * 60 * 1000) return { decision: 'skip', reason: 'scan-throttled' };
  return { decision: 'scan' };
}
export function selectProjectDreamSessions({ currentSessionId, sessions, workspacePath, workspaceIdentity }) {
  const identity = workspaceIdentity?.trim();
  const path = identity ? undefined : resolve(workspacePath);
  return sessions.filter(session => session.id !== currentSessionId && [undefined, 'interactive', 'fork', 'selection_side_chat', 'workflow_parent'].includes(session.taskType) && (identity ? session.workspaceID === identity : resolve(session.directory) === path));
}
export function formatProjectMemoryUpdate(update) {
  const lines = [`Background memory consolidation updated your memory directory: ${update.summary}`];
  if (update.paths.length) lines.push(`Files changed: ${update.paths.join(', ')}`);
  if (update.inContextPaths.length) lines.push(`Your loaded copy of ${update.inContextPaths.join(', ')} is now stale relative to disk — Read it again if you need current contents.`);
  lines.push('This is ambient context — do not narrate it to the user unless they ask or it is directly relevant to their request.');
  return lines.join('\n');
}
export function createMemoryDream({ storage, recall, readState = new Map(), now = Date.now, onError = () => {} }) {
  let lastScanAtMs = 0;
  let pendingUpdate;
  let running;
  const controller = new AbortController();
  async function execute(snapshot, options) {
    const abort = new AbortController();
    const detachShutdown = forwardAbort(controller.signal, abort);
    const detachInput = forwardAbort(options.abortSignal, abort);
    let acquiredPrior;
    try {
      const nowMs = now();
      throwIfAborted(abort.signal);
      const lastConsolidatedAtMs = await storage.readDreamLastConsolidatedAt();
      const timing = evaluateAutoDreamTiming({ lastConsolidatedAtMs, lastScanAtMs, nowMs });
      if (timing.decision === 'skip') return timing;
      lastScanAtMs = nowMs;
      const sessions = selectProjectDreamSessions({ currentSessionId: options.currentSessionId, sessions: await options.listSessions(), workspacePath: snapshot.workspaceRoot, workspaceIdentity: options.workspaceIdentity });
      const ids = (await Promise.all(sessions.map(async session => {
        try {
          const result = await options.statTranscript(session.id, { signal: abort.signal });
          return result.kind === 'file' && result.mtimeMs !== undefined && result.mtimeMs > lastConsolidatedAtMs ? String(session.id) : undefined;
        } catch { return undefined; }
      }))).filter(Boolean);
      throwIfAborted(abort.signal);
      if (ids.length < DREAM_MINIMUM_TRANSCRIPT_SESSIONS) return { decision: 'skip', reason: 'insufficient-sessions' };
      const prior = await storage.acquireDreamLock({ nowMs, signal: abort.signal });
      if (prior === null) return { decision: 'skip', reason: 'locked' };
      acquiredPrior = prior;
      throwIfAborted(abort.signal);
      const prompt = buildMemoryDreamPrompt({ memoryRoot: snapshot.memoryRoot, sessionIds: ids, transcriptRoot: options.transcriptRoot });
      const request = snapshot.prepareRequest ? await snapshot.prepareRequest(prompt, snapshot) : { messages: [...snapshot.messages, { role: 'user', content: prompt }], tools: snapshot.tools, toolSearchEnabled: false };
      const touched = new Set();
      const loop = await runMemoryAgentLoop({ ...snapshot, abortSignal: abort.signal, request, rootDir: snapshot.memoryRoot, maxTurns: DREAM_MAX_TURNS,
        onToolCall(call) { collectDreamTouchedPaths(touched, { ...snapshot, rootDir: snapshot.memoryRoot, toolCall: call }); },
      });
      throwIfAborted(abort.signal);
      const paths = [...touched];
      if (paths.length) {
        const inContextPaths = paths.filter(path => basename(path) === 'MEMORY.md' || recall?.getState().recalledPaths.has(path) || findReadState(readState, path));
        pendingUpdate = { paths, inContextPaths, source: 'dream', summary: `consolidated ${paths.length} memory file${paths.length === 1 ? '' : 's'}`, filesTouched: paths.length };
        recall?.invalidate(paths);
      }
      // Source retains the PID/mtime on success: do NOT release or erase this lock here.
      return { decision: 'completed', filesTouched: paths.length, paths, turns: loop.turns };
    } catch (error) {
      if (acquiredPrior !== undefined) {
        try { await storage.restoreDreamLockAfterFailure({ priorMtimeMs: acquiredPrior }); } catch { /* source best-effort recovery */ }
      }
      try { onError(error); } catch {}
      return { decision: abort.signal.aborted ? 'aborted' : 'error', error };
    } finally { detachShutdown(); detachInput(); }
  }
  return {
    run(snapshot, options) {
      if (controller.signal.aborted) return Promise.resolve({ decision: 'aborted' });
      if (running) return running;
      if (!options?.transcriptRoot || !options.listSessions || !options.statTranscript) return Promise.resolve({ decision: 'skip', reason: 'missing-transcripts' });
      running = execute(captureMemorySnapshot(snapshot), options).finally(() => { running = undefined; });
      return running;
    },
    consumeUpdate() {
      const update = pendingUpdate;
      pendingUpdate = undefined;
      return update ? { kind: 'attachment', name: 'memory_update', content: formatProjectMemoryUpdate(update), update } : undefined;
    },
    getLastScanAtMs: () => lastScanAtMs,
    shutdown() { controller.abort(); pendingUpdate = undefined; },
    async drain() { await running; },
  };
}
