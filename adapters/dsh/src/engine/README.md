# Memory engine Interface and source parity

This deep module has no DSH imports. The host Adapter owns session enablement, eligible root/fork selection, initial workspace identity, active-branch capture and successful-turn events. It passes a frozen request snapshot into [`createMemoryEngine`](<index.js>). Normal extraction never uses a JSON extraction protocol: every provider response is followed by real, restricted tool execution.

## Interface

```js
const engine = createMemoryEngine({ storage, onError, readState: mainReadState });
engine.schedule({
  boundaryMessageId,
  durableMessages, // {id,role,synthetic?,visibility?,parts:[text/tool]} or source {info,parts}
  messages,       // original normalized Main provider messages
  tools,          // original wire name/schema; optional internal semanticName/normalizeInput
  model,          // generateText({messages,tools,abortSignal,options,...})
  executeTool,    // (originalCall,{abortSignal,signal,readState}) => normalized result
  readState,      // inherited Main map, cloned independently by the engine
  memoryRoot, workingDirectory, workspaceRoot,
  projectMessages, // optional per-request capability/media-budget projection
  prepareRequest,  // optional (prompt,snapshot) => {messages,tools,toolSearchEnabled}
  isReadOnlyShell, isContainedShellRemoval, collectShellRemovalPaths,
});
await engine.drain();
engine.shutdown();
```

- `schedule` returns immediately; there is one running extraction and only the newest pending snapshot. Snapshots freeze nested messages, tool schemas and read capabilities at schedule time. Promise snapshots are frozen on acquisition; the host must freeze mutable inputs before awaiting its durable branch read.
- Cursor advances for success/no-op, direct memory-write skip and no-prose skip. Errors, cancelled work and failed acquisitions do not advance it. A missing cursor scans all eligible prose but does **not** recognize historical writes as direct writes.
- `model.generateText` returns `{text, reasoning?, toolCalls?:[{id,name,input}], assistantMessage?}`. A canonical `assistantMessage` preserves native replay/signature metadata and original block order; normalized `toolCalls` are still executed separately. The model retains its complete Main tool catalog (except ToolSearch); policy applies at execution, not by substituting toy schemas.
- `executeTool` returns `{success, modelContent?, output?, error?:{message}}`. It must use the supplied isolated `readState`, preserve original call IDs and **check cancellation immediately before each side effect**. The engine cannot undo an effect from an Adapter that ignores its abort signal. Late model responses are fenced before any tool execution or next request.
- Each model request gets a request-local media projection. Host-provided `projectMessages` must implement the host's model capability and budget policy. This seam intentionally does not import ZCode's provider media stack.
- PowerShell text is never interpreted by the POSIX parser. Its explicit trusted host classifiers govern virtual read-only commands and narrow root-contained deletion. Without those classifiers PowerShell is denied. The source POSIX parser and complete readonly policy are ported unchanged under [`shell`](<shell/bash-semantics.js>).
- Calls in one tool batch execute in parallel; all complete before the next model request. Tools returned by model request 5 (extraction) or 50 (Dream) still execute. There is no sixth/fifty-first request.
- Background errors invoke `onError` without escaping into foreground conversation turns.

## Dormant recall

[`ACTIVE_PROJECT_MEMORY_RETRIEVAL_BRANCH`](<recall.js>) is `default-index`; the fixed semantic flag is false. No background recall is started by the engine itself. `engine.recall.start(...)` is nonblocking and is inactive without an explicit semantic branch. The host must call `consume` only **after a complete foreground tool batch**, not after each tool. It consumes settled bodies once, rechecks current read-state, and records revisions only on actual injection.

The complete dormant implementation preserves sticky nonempty manifests, selector schema/conversation, ordered duplicate selections, post-filter five-item limit, 200-line/4096-UTF8-byte previews, stale warnings, 61440-character session start gate, cancellation, invalidation and lifecycle reset. `resetRecall()` is the host resume/compact cleanup seam. `recall.dispose()` clears the per-turn prefetch; `recall.invalidate(paths)` also clears touched read capabilities, recalled paths and manifest/selector caches.

## Explicit Dream only

```js
await engine.runDream(snapshot, {
  currentSessionId, workspaceIdentity, transcriptRoot,
  listSessions: async () => normalizedSessions,
  statTranscript: async (id, {signal}) => ({kind: 'file', mtimeMs}),
  abortSignal,
});
const oneShotAttachment = engine.consumeMemoryUpdate();
```

There is **no automatic Dream trigger**. The explicit call preserves 24-hour consolidation and 10-minute scan gates, five changed transcripts from other eligible sessions, PID ownership, the exact source prompt, 50 model requests, failure lock recovery and one-shot update attachment. The storage Adapter owns all memory filesystem effects and lock operations. Success preserves the source PID lock; it does not invoke the optional storage release helper.

## Source behavior that is easy to misstate

1. Extraction counts words by whitespace; an ordinary unspaced Chinese sentence counts as one and is skipped. This is source behavior, not a localization improvement.
2. A direct Write/Edit tool part skips extraction even when that tool attempt failed. The source does not inspect tool success.
3. Dream `filesTouched` records policy-permitted mutation attempts, including executor errors. It is **not** a count of confirmed committed writes.
4. Semantic recall preserves duplicate filenames and selection order. Filtering happens before its five-item slice.
5. 61440 characters is a prefetch **start gate**, not a hard cap: one final selected batch may overshoot it.
6. **Intentional safety divergence, approved by the lead:** the source marks even truncated recalled previews `isPartialView: false` while retaining a `limit`. With an unchanged revision, its Write handler can therefore overwrite a file after only a truncated recalled view. This port instead marks a limited recall as partial: both Write and Edit require a subsequent explicit Read that is not a partial synthesized preview. This is not bug-for-bug equivalence. The production semantic branch remains disabled.
7. Storage intentionally adds exact path casing, no symlink aliases/path traversal, a 5 MiB file cap and the DSH-specific sensitive `.dsh` segment. A lowercase `.md` extension is required, but an exactly cased `Title.md` is allowed, matching the source. Upstream manifests can follow file symlinks; these safety hardenings are not claimed byte-for-byte equivalence.
8. The source Dream prompt mentions CLAUDE.md and a logs layout; the prompt is retained verbatim. No transcript directory is invented by the engine; the host must supply an appropriate transcript Adapter before explicit Dream execution.

## Verification

[`engine-extraction.test.js`](<../../test/engine-extraction.test.js>), [`engine-policy-loop.test.js`](<../../test/engine-policy-loop.test.js>), [`engine-recall.test.js`](<../../test/engine-recall.test.js>) and [`engine-dream.test.js`](<../../test/engine-dream.test.js>) use Node's built-in test runner and isolated files under the task-owned test prefix. They cover real Write → Read → Edit and recall → Edit operations, actual PID locks and recovery, cancellation/late responses, scheduler cursor/coalescing, full provider catalogs, final-turn execution, source shell policy, source prompts and dormant branches. They do not install the plugin, change a profile, or start an alternate DSH server.
