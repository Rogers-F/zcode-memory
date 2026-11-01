/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode apps/zcode-cli/packages/core/src/memory/memory-agent-loop.ts.
 * Modifications: host-independent execution/read-state and media-projection seams; abort fences.
 * Real tools stay in every provider request; only the execution policy narrows their authority.
 */
import { evaluateMemoryAgentToolPolicy } from './tool-policy.js';
import { auxiliaryModelOptions, cloneValue, findReadState, semanticToolName, toolInput, throwIfAborted } from './common.js';
import { resolveSafeMemoryFilePath } from '../storage.js';

export async function runMemoryAgentLoop(input) {
  const messages = cloneValue(input.request.messages);
  const tools = input.request.tools;
  const readState = cloneValue(input.readState ?? new Map());
  let turns = 0;
  for (; turns < input.maxTurns; turns++) {
    throwIfAborted(input.abortSignal);
    const cloned = cloneValue(messages);
    const projected = input.projectMessages ? await input.projectMessages(cloned, input.model) : cloned;
    throwIfAborted(input.abortSignal);
    const response = await input.model.generateText({
      abortSignal: input.abortSignal,
      messages: projected.messages ?? projected,
      options: auxiliaryModelOptions(input.model),
      tools,
      toolSearchEnabled: input.request.toolSearchEnabled ?? false,
    });
    // An uncooperative provider may return after cancellation. Never execute those calls.
    throwIfAborted(input.abortSignal);
    const calls = response.toolCalls ?? [];
    const content = response.reasoning?.length
      ? [...cloneValue(response.reasoning), ...(response.text ? [{ type: 'text', text: response.text }] : [])]
      : response.text ?? '';
    // A native Adapter can preserve provider replay/signature data and interleaved
    // content order through a canonical message, while normalized calls still execute below.
    if (response.assistantMessage !== undefined && response.assistantMessage.role !== 'assistant') {
      throw new TypeError('assistantMessage must be a canonical assistant-role message');
    }
    messages.push(response.assistantMessage !== undefined
      ? cloneValue(response.assistantMessage)
      : { role: 'assistant', content, toolCalls: cloneValue(calls) });
    if (calls.length === 0) { turns++; break; }
    // Preserve upstream parallel batch execution and execute the final model turn's calls too.
    const results = await Promise.all(calls.map(async call => {
      throwIfAborted(input.abortSignal);
      const decision = evaluateMemoryAgentToolPolicy({ ...input, tools, toolCall: call });
      const resultMessage = (content, isError) => ({ role: 'tool', content, isError, toolCallId: call.id, toolName: call.name });
      if (!decision.allowed) return resultMessage(decision.reason, true);
      throwIfAborted(input.abortSignal);
      input.onToolCall?.(call);
      const name = semanticToolName(call, tools);
      if (name === 'Edit') {
        const args = toolInput(call, tools);
        const path = resolveSafeMemoryFilePath({ filePath: args.file_path, rootDir: input.rootDir, workingDirectory: input.workingDirectory, workspaceRoot: input.workspaceRoot });
        if (!findReadState(readState, path)) return resultMessage('File has not been read yet. Read it first before editing.', true);
      }
      throwIfAborted(input.abortSignal);
      const result = await input.executeTool({ id: call.id, name: call.name, input: call.input }, { abortSignal: input.abortSignal, signal: input.abortSignal, readState });
      throwIfAborted(input.abortSignal);
      return resultMessage(modelContentForToolResult(result), isErrorForToolResult(result));
    }));
    throwIfAborted(input.abortSignal);
    messages.push(...results);
  }
  return { messages, turns, readState };
}
export function modelContentForToolResult(result) {
  if (result?.modelContent !== undefined) return result.modelContent;
  if (result?.content !== undefined) return result.content;
  if (result?.success === false && result.error?.message) return result.error.message;
  if (typeof result?.output === 'string') return result.output;
  return result?.output === undefined ? '' : JSON.stringify(result.output) ?? '';
}
export function isErrorForToolResult(result) {
  if (result?.isError === true || result?.success === false) return true;
  const output = result?.output;
  if (output && typeof output === 'object') {
    if (typeof (output.isError ?? output.is_error) === 'boolean') return output.isError ?? output.is_error;
    if (output.interrupted === true) return true;
    if (output.status === 'failed' && output.exitCode !== 0 && !['Condition is false', 'Files differ', 'No matches found', 'Some directories were inaccessible'].includes(output.returnCodeInterpretation)) return true;
  }
  return false;
}
