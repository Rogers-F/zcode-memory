import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdtemp, stat } from 'node:fs/promises';

assert.ok(process.versions.electron, 'Run via scripts/integration-launcher.mjs (Electron ASAR filesystem)');
assert.ok(process.env.DSH_INTEGRATION_TEMP, 'An isolated temporary home is required');
export const installed = process.env.DSH_INTEGRATION_ROOT;
assert.ok(installed?.includes('app.asar'));
const anchored = createRequire(path.join(installed, 'package.json'));
let resolving = false;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (!resolving && specifier.startsWith('@deepseek-ai/')) {
    resolving = true;
    try { return { url: pathToFileURL(anchored.resolve(specifier)).href, shortCircuit: true }; }
    finally { resolving = false; }
  }
  return nextResolve(specifier, context);
} });
const load = name => import(`@deepseek-ai/${name}`);
let pluginURL = new URL('../../src/index.js', import.meta.url);
if (process.env.DSH_INTEGRATION_PLUGIN) {
  const target = process.env.DSH_INTEGRATION_PLUGIN;
  assert.ok(path.isAbsolute(target), 'Packaged plugin targets must be absolute');
  pluginURL = pathToFileURL((await stat(target)).isDirectory() ? path.join(target, 'src', 'index.js') : target);
}
export const pluginEntry = pluginURL.href;
export const { Context } = await load('cordis');
export const { AgentRegistry } = await load('dsh-agent');
export const { AgentLoop } = await load('dsh-agent-loop');
export const { SessionStore } = await load('dsh-session');
export const { SessionProjectionRegistry } = await load('dsh-session-projection');
export const { SystemPrompt } = await load('dsh-system-prompt');
export const { LlmRuntime, LlmAdapter, LlmError, isAgentLoopRequest, createUserMessage } = await load('dsh-llm');
export const { createVolatile, updateVolatile } = await load('cosmokit');
export const { ToolRuntime, defineTool } = await load('dsh-tools');
export const { default: LocalFileSystem } = await load('dsh-fs-local');
export const { WorkingDirectoryService } = await load('dsh-working-directory');
export const fileTools = await load('dsh-tool-fs');
export const { SandboxPolicyService } = await load('dsh-sandbox-policy');
export const { SandboxedFileSystem } = await load('dsh-fs-sandbox');
export const jsonlPersistence = await load('dsh-session-persistence-jsonl');
export const { HostConnectionService } = await load('dsh-client-connection');

export class ControlledModel extends LlmAdapter {
  requests = [];
  respond = () => ({ text: 'Controlled assistant response.' });
  async *stream(options) {
    this.requests.push(options);
    const response = await this.respond(options, this.requests.length - 1);
    if (response.error) throw new LlmError(response.error, 'CONTROLLED_ERROR');
    let index = 0;
    if (response.reasoning) yield { type: 'reasoning-delta', index: index++, text: response.reasoning };
    if (response.text) yield { type: 'text-delta', index: index++, text: response.text };
    for (const call of response.calls ?? []) yield { type: 'tool-call-delta', index: index++, id: call.id, name: call.name, argumentsDelta: JSON.stringify(call.arguments) };
    yield { type: 'finish', reason: { kind: response.calls?.length ? 'tool-calls' : 'stop' }, ...(response.replayState ? { replayState: response.replayState } : {}) };
  }
}

export async function createHarness({ sandboxMode } = {}) {
  const workspace = await mkdtemp(path.join(process.env.DSH_INTEGRATION_TEMP, 'workspace-'));
  const ctx = new Context();
  for (const plugin of [SessionStore, SessionProjectionRegistry, AgentRegistry, SystemPrompt, LlmRuntime, ToolRuntime, AgentLoop]) {
    const fiber = ctx.plugin(plugin, {});
    await fiber.await();
  }
  await ctx.fiber.await();
  for (const name of ['sessions', 'sessionProjections', 'agents', 'systemPrompt', 'llm', 'tools', 'agentLoop']) assert.ok(ctx[name], `Real DSH ${name} mounted`);
  if (sandboxMode) {
    await ctx.plugin(SandboxPolicyService, { mode: sandboxMode, workspaceRoot: workspace }).await();
    await ctx.plugin(SandboxedFileSystem, {}).await();
  } else await ctx.plugin(LocalFileSystem, {}).await();
  await ctx.plugin(WorkingDirectoryService, { defaultDirectory: process.env.DSH_INTEGRATION_TEMP }).await();
  await ctx.plugin(fileTools, { readImage: false }).await();
  const model = new ControlledModel();
  ctx.llm.registerAdapter(['memory-integration'], model);
  const handles = [];
  return { ctx, model, workspace,
    async persistence() {
      const root = await mkdtemp(path.join(process.env.DSH_INTEGRATION_TEMP, 'session-log-'));
      await ctx.plugin(jsonlPersistence, { root, compression: 'none' }).await();
      assert.ok(ctx.sessionPersistence);
    },
    async shell() {
      const { default: LocalSubprocess } = await load('dsh-subprocess-local');
      await ctx.plugin(LocalSubprocess, {}).await();
      const { default: PwshLocal } = await load('dsh-pwsh-local');
      const ShellEnvironment = await load('dsh-shell-env');
      await ctx.plugin(PwshLocal, {}).await();
      await ctx.plugin(ShellEnvironment, {}).await();
      await ctx.plugin(await load('dsh-tool-pwsh'), {}).await();
      assert.ok(ctx.tools.schemas().some(tool => tool.name === 'pwsh'));
    },
    async connection() {
      // The public carrier-neutral Host service needs no browser auth when
      // dispatching with explicit in-process peers; do not mount credentials.
      await ctx.plugin({ name: 'integration-in-process-connection', apply(owner) { new HostConnectionService(owner, [], undefined); } }).await();
      return ctx.connection;
    },
    async memory(input = {}) {
      const plugin = await import(pluginEntry);
      // Regression: never wrap apply() here. The old wrapper swallowed its return
      // value and hid Cordis's Invalid effect activation failure in shipped packages.
      const fiber = ctx.plugin(plugin, input);
      await fiber.await();
      const config = fiber.config;
      const controller = plugin.getController(ctx);
      assert.ok(controller, 'Real plugin activation publishes its controller');
      return { controller, config, unload: () => fiber.dispose() };
    },
    async agent(options = {}) {
      const handle = await ctx.agents.create({ sessionId: randomUUID(), meta: { cwd: workspace }, agentOptions: { provider: 'memory-integration', model: 'controlled' }, ...options });
      handles.push(handle);
      return handle.agent;
    },
    async resume(sessionId) {
      const handle = await ctx.agents.resume({ resumeSessionId: sessionId, agentOptions: { provider: 'memory-integration', model: 'controlled' } });
      handles.push(handle);
      return handle.agent;
    },
    async dispose(agent) {
      const handle = handles.find(candidate => candidate.agent === agent);
      assert.ok(handle, 'The harness owns this agent');
      await handle.dispose();
    },
    async turn(agent, text) {
      agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
      await agent.whenIdle();
      return agent.session.log;
    },
    async close() {
      for (const handle of handles.reverse()) await handle.dispose();
      await ctx.fiber.dispose();
    },
  };
}
