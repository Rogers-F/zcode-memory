/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode memory-agent-loop.ts, model/auxiliary-model-options.ts and tool/read-file-state.ts.
 * Modifications: normalized host-independent JavaScript ESM messages, model and read-state seams.
 */
import { resolve } from 'node:path';

export function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value instanceof Map) return new Map([...value].map(([key, entry]) => [key, cloneValue(entry)]));
  if (value instanceof Set) return new Set(value);
  if (value instanceof Date) return new Date(value);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }
  return value;
}
export function auxiliaryModelOptions(model) {
  return {
    reasoningLevel: model.optionSpecs?.reasoningLevel?.values?.[0],
    maxOutputTokens: Math.min(5000, model.optionSpecs?.maxOutputTokens?.max ?? 5000),
  };
}
export function textContent(content) {
  return typeof content === 'string' ? content : (content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
}
export function pathKey(path) {
  const canonical = resolve(path).replace(/\\/g, '/');
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}
export function findReadState(readState, filePath) {
  if (!readState) return undefined;
  const target = pathKey(filePath);
  for (const [key, value] of readState) {
    const path = value?.path ?? value?.filePath;
    if ((path && pathKey(path) === target) || (typeof key === 'string' && pathKey(key) === target)) return value;
  }
}
export function throwIfAborted(signal) { signal?.throwIfAborted(); }
export function semanticToolName(call, tools = []) {
  return tools.find(tool => tool.name === call.name)?.semanticName ?? call.semanticName ?? call.name;
}
export function toolInput(call, tools = []) {
  const contract = tools.find(tool => tool.name === call.name);
  return contract?.normalizeInput ? contract.normalizeInput(call.input) : call.input;
}
/** Request-local snapshot; live model/executor functions intentionally retain their identity. */
export function captureMemorySnapshot(snapshot) {
  return {
    ...snapshot,
    durableMessages: cloneValue(snapshot.durableMessages ?? []),
    messages: cloneValue(snapshot.messages ?? snapshot.request?.messages ?? []),
    tools: (snapshot.tools ?? snapshot.request?.tools ?? []).filter(tool => (tool.semanticName ?? tool.name) !== 'ToolSearch').map(cloneValue),
    readState: cloneValue(snapshot.readState ?? snapshot.readFileState ?? new Map()),
  };
}
export function forwardAbort(signal, controller) {
  const abort = () => { if (!controller.signal.aborted) controller.abort(signal?.reason); };
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  return () => signal?.removeEventListener('abort', abort);
}
