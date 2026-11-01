/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode memory/memory-agent-loop.ts and memory/dream.ts.
 * Modifications: host wire names retained via semanticName; PowerShell uses an explicit classifier seam.
 * Storage resolves lexical containment here and rechecks symlinks/revisions at actual mutation time.
 */
import { isAbsolute } from 'node:path';
import { resolveSafeMemoryFilePath, resolveContainedMemoryFilePath } from '../storage.js';
import { analyzeBashCommand, isBashCommandPermissionSafe } from './shell/bash-command-parser.js';
import { isRuntimeReadOnlyBashCommand } from './shell/bash-semantics.js';
import { semanticToolName, toolInput } from './common.js';

const readOnly = new Set(['Read', 'Grep', 'Glob']);
function resolvePath(filePath, input, safe = false) {
  try { return (safe ? resolveSafeMemoryFilePath : resolveContainedMemoryFilePath)({ filePath, rootDir: input.rootDir, workingDirectory: input.workingDirectory, workspaceRoot: input.workspaceRoot }); } catch { return undefined; }
}
function deny(rootDir) { return { allowed: false, reason: `only Read, Grep, Glob, read-only Bash, and Edit/Write within ${rootDir} are allowed` }; }
export function evaluateMemoryAgentToolPolicy(input) {
  const contract = input.tools.find(tool => tool.name === input.toolCall.name);
  if (!contract) return { allowed: false, reason: `<tool_use_error>Error: No such tool available: ${input.toolCall.name}</tool_use_error>` };
  const name = semanticToolName(input.toolCall, input.tools);
  const args = toolInput(input.toolCall, input.tools);
  if (name === 'Agent' || input.toolCall.name.startsWith('mcp__') || name.startsWith('mcp__') || contract.sideEffectScope === 'network') return deny(input.rootDir);
  if (name === 'Write' || name === 'Edit') {
    const filePath = args?.file_path;
    return typeof filePath === 'string' && filePath.endsWith('.md') && resolvePath(filePath, input, true) ? { allowed: true } : deny(input.rootDir);
  }
  if (name === 'Bash') {
    const command = args?.command;
    if (typeof command === 'string' && command) {
      const isPowerShell = contract.shell === 'powershell' || /(?:^|[_.])pwsh$/i.test(input.toolCall.name);
      const context = { workingDirectory: input.workingDirectory, workspaceRoot: input.workspaceRoot, rootDir: input.rootDir, contract };
      // Never classify PowerShell text with the POSIX parser. The host must supply its trusted classifier.
      const readonly = isPowerShell ? input.isReadOnlyShell?.(command, context) === true : isRuntimeReadOnlyBashCommand(command, context);
      if (readonly || (isPowerShell ? input.isContainedShellRemoval?.(command, context) === true : containedMarkdownRemoval(command, input))) return { allowed: true };
    }
    return { allowed: false, reason: `Only read-only shell commands and rm with all paths inside ${input.rootDir} are permitted in this context (ls, find, grep, cat, stat, wc, head, tail, and similar)` };
  }
  return readOnly.has(name) ? { allowed: true } : deny(input.rootDir);
}
export function containedMarkdownRemoval(command, input) {
  const analysis = analyzeBashCommand(command);
  if (!isBashCommandPermissionSafe(analysis) || analysis.commands.length !== 1) return false;
  const invocation = analysis.commands[0];
  if (invocation.argv[0] !== 'rm' || invocation.redirects.length || invocation.envAssignments.length) return false;
  let afterOptions = false;
  let count = 0;
  for (const argument of invocation.argv.slice(1)) {
    if (!afterOptions) {
      if (argument === '--') { afterOptions = true; continue; }
      if (argument.startsWith('-')) {
        if (argument === '--recursive' || /^-[a-zA-Z]*[rR]/u.test(argument)) return false;
        continue;
      }
    }
    if (/[*?[]/u.test(argument) || !isAbsolute(argument) || !argument.endsWith('.md') || !resolvePath(argument, input)) return false;
    count++;
  }
  return count > 0;
}
/** Source deliberately records allowed mutation attempts, even if the executor returns a tool error. */
export function collectDreamTouchedPaths(paths, input) {
  const name = semanticToolName(input.toolCall, input.tools);
  const args = toolInput(input.toolCall, input.tools);
  const add = path => { if (typeof path !== 'string' || !path.endsWith('.md')) return; const resolved = resolvePath(path, input); if (resolved) paths.add(resolved); };
  if (name === 'Write' || name === 'Edit') { add(args?.file_path); return; }
  if (name !== 'Bash' || typeof args?.command !== 'string') return;
  const contract = input.tools?.find(tool => tool.name === input.toolCall.name);
  if (contract?.shell === 'powershell' || /(?:^|[_.])pwsh$/i.test(input.toolCall.name)) {
    for (const path of input.collectShellRemovalPaths?.(args.command, input) ?? []) add(path);
    return;
  }
  for (const invocation of analyzeBashCommand(args.command).commands) {
    if (invocation.argv[0] !== 'rm') continue;
    for (const argument of invocation.argv.slice(1)) if (argument !== '--' && !argument.startsWith('-')) add(argument);
  }
}
