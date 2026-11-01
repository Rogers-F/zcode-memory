/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode apps/zcode-cli/packages/core/src/memory/extraction.ts.
 * Modifications: JS ESM, normalized messages, eager isolated snapshots and observable errors.
 * Source behavior retained: whitespace three-word gate; attempted Write/Edit skips regardless of status.
 */
import { resolveContainedMemoryFilePath } from '../storage.js';
import { captureMemorySnapshot } from './common.js';
import unifiedCore from '../../shared.cjs';

const info = message => message.info ?? message;
const parts = message => message.parts ?? (typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content ?? []);
function afterCursor(messages, cursor) {
  if (!cursor) return messages;
  const index = messages.findIndex(message => info(message).id === cursor);
  return index < 0 ? undefined : messages.slice(index + 1);
}
export function evaluateMemoryExtraction(snapshot, cursor) {
  const messages = snapshot.durableMessages;
  const after = afterCursor(messages, cursor);
  const messageCount = (after ?? messages).length;
  for (const message of after ?? []) {
    if (info(message).role !== 'assistant') continue;
    for (const part of parts(message)) {
      if (part.type !== 'tool' || !['Write', 'Edit'].includes(part.tool)) continue;
      const filePath = part.state?.input?.file_path;
      if (typeof filePath !== 'string' || !filePath) continue;
      try {
        if (resolveContainedMemoryFilePath({ filePath, rootDir: snapshot.memoryRoot, workingDirectory: snapshot.workingDirectory, workspaceRoot: snapshot.workspaceRoot })) {
          return { decision: 'skip', messageCount, reason: 'direct-memory-write' };
        }
      } catch { /* malformed tool paths are not direct writes */ }
    }
  }
  const eligible = (after ?? messages).some(message => {
    const meta = info(message);
    return meta.role === 'user' && meta.synthetic !== true && meta.visibility !== 'model-only' && parts(message).some(part => part.type === 'text' && part.ignored !== true && part.synthetic !== true && unifiedCore.countWords(part.text) >= 3);
  });
  return eligible ? { decision: 'run', messageCount } : { decision: 'skip', messageCount, reason: 'no-user-prose' };
}

/** One running snapshot and only the newest pending snapshot. Failures/cancellation never advance cursor. */
export function createMemoryExtractionScheduler(execute, { onError = () => {}, initialCursor, onCursor = async () => {} } = {}) {
  let cursor = initialCursor;
  let latestPending;
  let running;
  let shuttingDown = false;
  const controller = new AbortController();
  const report = error => { try { onError(error); } catch { /* observer cannot break scheduling */ } };
  const acquire = snapshot => {
    // Freeze synchronously for plain snapshots, not in the later Promise callback.
    try {
      const value = snapshot?.then ? snapshot.then(captureMemorySnapshot) : captureMemorySnapshot(snapshot);
      return Promise.resolve(value).then(snapshot => ({ status: 'acquired', snapshot }), error => { report(error); return { status: 'error' }; });
    } catch (error) { report(error); return Promise.resolve({ status: 'error' }); }
  };
  async function processSnapshot(snapshot) {
    const decision = evaluateMemoryExtraction(snapshot, cursor);
    if (decision.decision === 'skip') { if (snapshot.boundaryMessageId) { await onCursor(snapshot.boundaryMessageId); cursor = snapshot.boundaryMessageId; } return; }
    const status = await execute({ abortSignal: controller.signal, messageCount: decision.messageCount, snapshot });
    if (!shuttingDown && ['success', 'no-op'].includes(status) && snapshot.boundaryMessageId) { await onCursor(snapshot.boundaryMessageId); cursor = snapshot.boundaryMessageId; }
  }
  async function run(first) {
    try {
      let current = first;
      while (current && !shuttingDown) {
        const acquired = await waitForAcquisition(current, controller.signal);
        if (acquired.status === 'shutdown' || shuttingDown) break;
        if (acquired.status === 'acquired') {
          try { await processSnapshot(acquired.snapshot); } catch (error) { report(error); }
        }
        current = shuttingDown ? undefined : latestPending;
        latestPending = undefined;
      }
    } finally { if (shuttingDown) latestPending = undefined; running = undefined; }
  }
  return {
    async drain() { while (running) await running; },
    getCursor: () => cursor,
    hasPendingWork: () => !!(running || latestPending),
    schedule(snapshot) {
      if (shuttingDown) return;
      const acquired = acquire(snapshot);
      if (running) latestPending = acquired;
      else running = run(acquired);
    },
    shutdown() { if (!shuttingDown) { shuttingDown = true; latestPending = undefined; controller.abort(); } },
  };
}
function waitForAcquisition(acquisition, signal) {
  if (signal.aborted) return Promise.resolve({ status: 'shutdown' });
  return new Promise(resolve => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); resolve({ status: 'shutdown' }); };
    signal.addEventListener('abort', onAbort, { once: true });
    acquisition.then(result => { cleanup(); resolve(result); });
  });
}
