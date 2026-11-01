import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, installed, createVolatile, updateVolatile, isAgentLoopRequest } from './runtime.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import './policy-lifecycle.mjs';
import './custom-scope.mjs';
import './resume-routes.mjs';
import './shell-safety.mjs';
import './plugin-activation.mjs';
import './rpc-carrier.mjs';

const fact = '---\nname: concise\ndescription: Preferred explanation style\nmetadata:\n  type: user\n---\nThe user prefers concise explanations with worked examples.\n';
const pointer = '- [Explanation preference](concise.md) — concise explanations with examples\n';
const text = request => request.messages.map(message => message.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? '').join('\n');
console.log(`Real DSH runtime: ${installed}; Electron ${process.versions.electron}; Node ${process.versions.node}`);
test('real DSH Context and agent-loop complete a controlled model turn', async () => {
  const h = await createHarness();
  try {
    const agent = await h.agent();
    await h.turn(agent, 'Only a local controlled model may answer.');
    assert.equal(h.model.requests.length, 1);
    assert.equal(agent.session.log.findLast(event => event.type === 'turn/end').data.reason.kind, 'completed');
    assert.deepEqual(h.model.requests[0].tools.map(tool => tool.name), ['edit', 'read', 'write']);
  } finally { await h.close(); }
});

test('memory defaults off and performs no background model request', async () => {
  const h = await createHarness();
  try {
    const { controller, config } = await h.memory();
    assert.equal(config.enabled.get(), false);
    const agent = await h.agent();
    await h.turn(agent, 'Remember my preference for concise explanations.');
    await controller.drain();
    assert.equal(controller.inspect(agent.session.id).enabled, false);
    assert.equal(controller.inspect(agent.session.id).rootDir, undefined);
    assert.equal(h.model.requests.length, 1);
    assert.doesNotMatch(text(h.model.requests[0]), /# Memory|Persistent Agent Memory/);
  } finally { await h.close(); }
});

test('memory enabling is frozen for existing agents and applies to new agents', async () => {
  const h = await createHarness();
  try {
    const { controller, config } = await h.memory({ extractionEnabled: false });
    const old = await h.agent();
    updateVolatile(config.enabled, createVolatile(true));
    const next = await h.agent();
    assert.equal(controller.inspect(old.id).enabled, false);
    assert.equal(controller.inspect(next.id).enabled, true);
    await h.turn(old, 'An existing session remains off.');
    await h.turn(next, 'A new session includes memory.');
    assert.doesNotMatch(text(h.model.requests[0]), /# Memory/);
    assert.match(text(h.model.requests[1]), /# Memory/);
    updateVolatile(config.enabled, createVolatile(false));
    await h.turn(next, 'The enabled session stays enabled.');
    assert.match(text(h.model.requests[2]), /# Memory/);
  } finally { await h.close(); }
});

test('a missing index stays frozen while a new session loads the new index once', async () => {
  const h = await createHarness();
  try {
    const { controller } = await h.memory({ enabled: true, extractionEnabled: false });
    const first = await h.agent();
    const root = controller.inspect(first.id).rootDir;
    await writeFile(path.join(root, 'MEMORY.md'), pointer);
    await h.turn(first, 'This session had no index.');
    assert.doesNotMatch(text(h.model.requests.at(-1)), /Explanation preference/);
    const second = await h.agent();
    await h.turn(second, 'This session sees the index.');
    assert.match(text(h.model.requests.at(-1)), /Explanation preference/);
    await writeFile(path.join(root, 'MEMORY.md'), '- [Changed index](changed.md) — changed after session started\n');
    await h.turn(second, 'The prefix is still frozen.');
    assert.doesNotMatch(text(h.model.requests.at(-1)), /Changed index/);
    assert.equal(h.model.requests.at(-1).messages.filter(m => m.source?.kind === 'zcode-memory-index').length, 1);
  } finally { await h.close(); }
});

test('a completed real turn extracts through real tools and a new session recalls the file', async () => {
  const h = await createHarness();
  try {
    const { controller } = await h.memory({ enabled: true });
    const first = await h.agent();
    const root = controller.inspect(first.id).rootDir;
    let background = 0;
    h.model.respond = request => {
      if (isAgentLoopRequest(request)) return { text: 'I will remember this preference.' };
      background++;
      return background === 1 ? { calls: [
        { id: 'save-fact', name: 'write', arguments: { file_path: path.join(root, 'concise.md'), content: fact } },
        { id: 'save-index', name: 'write', arguments: { file_path: path.join(root, 'MEMORY.md'), content: pointer } },
      ] } : { text: 'Memory has been saved.' };
    };
    await h.turn(first, 'Please remember I prefer concise explanations with examples.');
    await controller.drain();
    assert.equal(background, 2, 'one write batch and one completion request');
    assert.match(await readFile(path.join(root, 'concise.md'), 'utf8'), /originSessionId:/);
    assert.equal(await readFile(path.join(root, 'MEMORY.md'), 'utf8'), pointer);
    assert.ok(controller.inspect(first.id).cursor);
    const backgroundRequests = h.model.requests.filter(request => !isAgentLoopRequest(request));
    assert.deepEqual(backgroundRequests[0].tools, h.model.requests[0].tools, 'the real prompt tool list must not be narrowed');
    assert.ok(backgroundRequests[1].messages.some(message => message.role === 'tool' && message.isError === false));
    const next = await h.agent();
    let foreground = 0;
    h.model.respond = request => {
      if (!isAgentLoopRequest(request)) return { text: 'No new memory.' };
      foreground++;
      return foreground === 1 ? { calls: [{ id: 'recall-file', name: 'read', arguments: { file_path: path.join(root, 'concise.md') } }] } : { text: 'You prefer concise explanations with worked examples.' };
    };
    await h.turn(next, 'What explanation style do I prefer?');
    await controller.drain();
    const recall = h.model.requests.filter(isAgentLoopRequest).at(-1);
    assert.match(text(recall), /Explanation preference/);
    assert.match(text(recall), /The user prefers concise explanations with worked examples/);
    assert.ok(next.session.log.some(event => event.type === 'tool/result'));
  } finally { await h.close(); }
});

test('background tool continuation preserves opaque provider replay state and reasoning', async () => {
  const h = await createHarness();
  try {
    const { controller } = await h.memory({ enabled: true });
    const agent = await h.agent();
    const file = path.join(controller.inspect(agent.id).rootDir, 'replay.md');
    await writeFile(file, 'Independent replay-state fixture.');
    const replayState = { response: { signature: 'controlled-response-signature' }, blocks: [{ signature: 'controlled-reasoning-signature' }, { signature: 'controlled-tool-signature' }] };
    let background = 0;
    h.model.respond = request => {
      if (isAgentLoopRequest(request)) return { text: 'Acknowledged.' };
      return ++background === 1 ? { reasoning: 'Controlled reasoning before the memory read.', replayState, calls: [{ id: 'replay-read', name: 'read', arguments: { file_path: file } }] } : { text: 'Memory review completed.' };
    };
    await h.turn(agent, 'Remember my durable preference with provider replay metadata.');
    await controller.drain();
    assert.equal(background, 2);
    const continuation = h.model.requests.filter(request => !isAgentLoopRequest(request)).at(-1);
    const assistant = continuation.messages.findLast(message => message.role === 'assistant');
    assert.deepEqual(assistant.source.replayState, replayState);
    assert.equal(assistant.content[0].type, 'reasoning');
    assert.equal(assistant.content[0].text, 'Controlled reasoning before the memory read.');
    assert.equal(assistant.content[1].type, 'tool-call');
  } finally { await h.close(); }
});
