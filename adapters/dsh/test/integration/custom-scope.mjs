import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { createHarness, isAgentLoopRequest } from './runtime.mjs';

for (const scope of ['user', 'project', 'local']) test(`custom ${scope} scope uses its dedicated root and never runs main-agent extraction`, async () => {
  const h = await createHarness();
  try {
    const preset = `integration-${scope}`;
    const { controller } = await h.memory({ enabled: true, customAgents: { [preset]: scope } });
    const parent = await h.agent();
    const child = await h.agent({ parentAgent: parent, meta: { cwd: h.workspace, origin: 'subagent', agentPreset: preset } });
    const state = controller.inspect(child.id);
    assert.equal(state.enabled, true);
    assert.equal(state.customScope, scope);
    const expected = scope === 'user'
      ? path.join(process.env.DSH_HOME, 'zcode-memory', 'agent-memory', preset)
      : path.join(h.workspace, '.dsh', scope === 'project' ? 'agent-memory' : 'agent-memory-local', preset);
    const canonicalExpected = await realpath(expected);
    assert.equal(await realpath(state.rootDir), canonicalExpected);
    await h.turn(child, 'Please remember a long lived custom agent preference.');
    await controller.drain();
    assert.equal(h.model.requests.filter(request => !isAgentLoopRequest(request)).length, 0);
    const system = h.model.requests[0].messages.filter(message => message.role === 'system').flatMap(message => message.content).map(block => block.text).join('\n');
    assert.match(system, /# Persistent Agent Memory/);
    assert.ok(system.includes(state.rootDir));
    assert.equal(controller.inspect(child.id).cursor, undefined);
    await h.ctx.workingDirectory.set(child, state.rootDir, new AbortController().signal);
    let calls = 0;
    h.model.respond = () => ++calls === 1 ? { calls: [{ id: 'custom-cwd-write', name: 'write', arguments: { file_path: 'custom-current.md', content: '---\nname: custom-current\nmetadata:\n  type: user\n---\nCustom scope follows the current directory.\n' } }] } : { text: 'Saved custom memory.' };
    await h.turn(child, 'Save this durable custom-agent preference.');
    const saved = await readFile(path.join(state.rootDir, 'custom-current.md'), 'utf8');
    assert.ok(saved.includes(`originSessionId: ${child.id}`), 'custom-scope current-directory writes must remain memory-owned across Windows path aliases');
  } finally { await h.close(); }
});

test('ordinary runtime children do not inherit main-agent memory extraction or tools rules', async () => {
  const h = await createHarness();
  try {
    const { controller } = await h.memory({ enabled: true });
    const parent = await h.agent();
    const child = await h.agent({ parentAgent: parent, meta: { cwd: h.workspace, origin: 'subagent' } });
    assert.equal(controller.inspect(parent.id).enabled, true);
    assert.equal(controller.inspect(child.id).enabled, false);
    await h.turn(child, 'Please remember some independent child agent preference.');
    await controller.drain();
    assert.equal(h.model.requests.length, 1);
    const system = h.model.requests[0].messages.filter(message => message.role === 'system').flatMap(message => message.content).map(block => block.text).join('\n');
    assert.doesNotMatch(system, /# Memory|Persistent Agent Memory/);
  } finally { await h.close(); }
});
