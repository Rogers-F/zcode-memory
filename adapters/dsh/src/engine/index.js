/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode runtime/helpers/project-memory-{agent,extraction,recall,dream}.ts.
 * Modifications: small host-independent ESM Interface over normalized snapshot/model/tool/storage Adapters.
 * Host owns session eligibility/frozen enablement and invokes schedule only after completed turns.
 */
import { buildMemoryExtractionPrompt } from '../prompts.js';
import { createMemoryExtractionScheduler } from './extraction.js';
import { runMemoryAgentLoop } from './agent-loop.js';
import { captureMemorySnapshot, throwIfAborted } from './common.js';
import { createMemoryRecall } from './recall.js';
import { createMemoryDream } from './dream.js';

export * from './extraction.js';
export * from './agent-loop.js';
export * from './tool-policy.js';
export * from './recall.js';
export * from './dream.js';
export { captureMemorySnapshot, auxiliaryModelOptions } from './common.js';
export const EXTRACTION_MAX_TURNS = 5;

/**
 * snapshot = { boundaryMessageId, durableMessages, messages, tools, model, executeTool,
 *   readState: Map, memoryRoot, workingDirectory, workspaceRoot, projectMessages?, prepareRequest?,
 *   isReadOnlyShell?, isContainedShellRemoval?, collectShellRemovalPaths? }.
 * executeTool receives ORIGINAL wire names/inputs and {abortSignal, signal, readState}; it MUST
 * check abortSignal immediately before effects and use the supplied isolated map for Read/Edit.
 * tools may add semanticName/normalizeInput for policy without changing their provider schema.
 * model.generateText returns {text, reasoning?, toolCalls?:[{id,name,input}], assistantMessage?};
 * optional canonical assistantMessage preserves native replay metadata. Calls are real tools,
 * not a JSON extraction protocol. An uncooperative provider's late result is fenced before execution.
 */
export function createMemoryEngine({ storage, model, executor, executeTool = executor, readState = new Map(), now = Date.now, onError = () => {}, initialCursor, onCursor, ...defaults }) {
  if (!storage) throw new TypeError('storage Adapter is required');
  let closed = false;
  const report = error => { try { onError(error); } catch {} };
  function completeSnapshot(snapshot) {
    return captureMemorySnapshot({ ...defaults, model, executeTool, readState, memoryRoot: storage.rootDir, ...snapshot });
  }
  const recall = createMemoryRecall({ storage, readState, now, onError: report });
  const dream = createMemoryDream({ storage, recall, readState, now, onError: report });
  const scheduler = createMemoryExtractionScheduler(async ({ snapshot, abortSignal, messageCount }) => {
    try {
      throwIfAborted(abortSignal);
      const manifest = await storage.manifest({ signal: abortSignal });
      throwIfAborted(abortSignal);
      const prompt = buildMemoryExtractionPrompt({ manifest, messageCount });
      const request = snapshot.prepareRequest ? await snapshot.prepareRequest(prompt, snapshot) : { messages: [...snapshot.messages, { role: 'user', content: prompt }], tools: snapshot.tools, toolSearchEnabled: false };
      throwIfAborted(abortSignal);
      await runMemoryAgentLoop({ ...snapshot, request, rootDir: snapshot.memoryRoot, maxTurns: EXTRACTION_MAX_TURNS, abortSignal });
      return 'success';
    } catch (error) {
      if (abortSignal.aborted || error?.name === 'AbortError') return 'aborted';
      report(error);
      return 'error';
    }
  }, { onError: report, initialCursor, onCursor });
  return {
    schedule(snapshot) {
      if (closed) return;
      // The host captures the active branch up to the durable boundary before passing this snapshot.
      scheduler.schedule(snapshot?.then ? snapshot.then(completeSnapshot) : completeSnapshot(snapshot));
    },
    async drain() { await Promise.all([scheduler.drain(), dream.drain(), recall.drain()]); },
    getCursor: scheduler.getCursor,
    hasPendingWork: scheduler.hasPendingWork,
    shutdown() { closed = true; scheduler.shutdown(); recall.dispose(); dream.shutdown(); },
    recall,
    runDream(snapshot, options) { return dream.run(completeSnapshot(snapshot), options); },
    consumeMemoryUpdate: dream.consumeUpdate,
    resetRecall() { recall.reset(); },
  };
}
