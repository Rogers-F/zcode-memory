import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHarness, isAgentLoopRequest, createVolatile, updateVolatile } from './runtime.mjs';

const missing = file => assert.rejects(stat(file), { code: 'ENOENT' });
const toolMessage = h => h.model.requests.at(-1).messages.findLast(message => message.role === 'tool');
const messageText = message => message.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
async function invoke(h, agent, file, content = 'integration fixture') {
  let count = 0;
  h.model.respond = () => ++count === 1 ? { calls: [{ id: `write-${Date.now()}`, name: 'write', arguments: { file_path: file, content } }] } : { text: 'Tool outcome observed.' };
  await h.turn(agent, 'Exercise the requested tool operation.');
  return toolMessage(h);
}

for (const failure of ['error', 'aborted']) test(`a ${failure} foreground turn never schedules extraction`, async () => {
  const h = await createHarness();
  try {
    const { controller } = await h.memory({ enabled: true });
    const agent = await h.agent();
    const entered = Promise.withResolvers();
    h.model.respond = async request => {
      if (failure === 'error') return { error: 'Controlled foreground failure' };
      entered.resolve();
      await new Promise(resolve => request.signal.addEventListener('abort', resolve, { once: true }));
      return { text: 'Late response after cancellation.' };
    };
    const running = h.turn(agent, 'Please remember this durable user preference.');
    if (failure === 'aborted') { await entered.promise; agent.cancel({ kind: 'user' }); }
    await running;
    await controller.drain();
    assert.equal(agent.session.log.findLast(event => event.type === 'turn/end').data.reason.kind, failure);
    assert.equal(h.model.requests.filter(request => !isAgentLoopRequest(request)).length, 0);
    assert.equal(controller.inspect(agent.id).cursor, undefined);
  } finally { await h.close(); }
});

test('background model failure leaves the foreground successful and the extraction cursor unadvanced', async () => {
  const h = await createHarness();
  try {
    const { controller } = await h.memory({ enabled: true });
    const agent = await h.agent();
    h.model.respond = request => isAgentLoopRequest(request) ? { text: 'Foreground completed.' } : { error: 'Controlled background failure' };
    await h.turn(agent, 'Remember my durable preference for concise output.');
    await controller.drain();
    assert.equal(agent.session.log.findLast(event => event.type === 'turn/end').data.reason.kind, 'completed');
    assert.equal(h.model.requests.length, 2);
    assert.equal(controller.inspect(agent.id).cursor, undefined);
    assert.equal(controller.inspect(agent.id).pending, false);
  } finally { await h.close(); }
});

test('enabled state remains frozen for background extraction after the setting turns off', async () => {
  const h = await createHarness();
  try {
    const { controller, config } = await h.memory({ enabled: true });
    const agent = await h.agent();
    updateVolatile(config.enabled, createVolatile(false));
    await h.turn(agent, 'Remember this durable preference despite the global toggle.');
    await controller.drain();
    assert.equal(h.model.requests.filter(request => !isAgentLoopRequest(request)).length, 1);
    assert.ok(controller.inspect(agent.id).cursor);
    const next = await h.agent();
    await h.turn(next, 'The new session must remain disabled.');
    await controller.drain();
    assert.equal(controller.inspect(next.id).enabled, false);
    assert.equal(h.model.requests.filter(request => !isAgentLoopRequest(request)).length, 1);
  } finally { await h.close(); }
});

test('plugin unload during asynchronous agent materialization leaves no live memory rules', async () => {
  const h = await createHarness();
  try {
    const { controller, unload } = await h.memory({ enabled: true });
    const id = `materializing-${Date.now()}`;
    let settled = false;
    const creation = h.agent({ sessionId: id });
    const observed = creation.then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
    for (let attempts = 0; !controller.inspect(id) && !settled && attempts < 100; attempts++) await new Promise(setImmediate);
    assert.ok(controller.inspect(id), 'materialization has entered its public inspectable state');
    assert.equal(settled, false, 'unload must race asynchronous materialization, not a completed agent');
    await unload();
    const outcome = await observed;
    assert.ok(!controller.inspect(id) || controller.inspect(id).closed, 'the materializing state is retired or closed');
    if (outcome.value) {
      await h.turn(outcome.value, 'An unloaded plugin must not inject memory.');
      const system = h.model.requests.at(-1).messages.filter(m => m.role === 'system').flatMap(m => m.content).map(block => block.text).join('\n');
      assert.doesNotMatch(system, /# Memory|Persistent Agent Memory/);
    }
    await controller.drain();
    assert.equal(controller.inspect(id)?.pending ?? false, false);
  } finally { await h.close(); }
});

test('plugin close fences an uncooperative late background tool call', async () => {
  const h = await createHarness();
  const release = Promise.withResolvers();
  try {
    const { controller } = await h.memory({ enabled: true });
    const agent = await h.agent();
    const target = path.join(controller.inspect(agent.id).rootDir, 'late.md');
    const entered = Promise.withResolvers();
    h.model.respond = async request => {
      if (isAgentLoopRequest(request)) return { text: 'Foreground completed.' };
      entered.resolve();
      await release.promise;
      return { calls: [{ id: 'late-write', name: 'write', arguments: { file_path: target, content: 'must not be written' } }] };
    };
    await h.turn(agent, 'Remember this preference after the foreground completes.');
    await entered.promise;
    const closing = controller.close();
    release.resolve();
    await closing;
    assert.ok(!controller.inspect(agent.id) || controller.inspect(agent.id).closed, 'the background scope is retired or closed');
    assert.equal(controller.inspect(agent.id)?.cursor, undefined);
    await missing(target);
  } finally { release.resolve(); await h.close(); }
});

for (const policy of ['guard', 'pre-execute']) test(`real tools ${policy} denial cannot be bypassed by memory`, async () => {
  const h = await createHarness();
  try {
    const { controller } = await h.memory({ enabled: true });
    const agent = await h.agent();
    const target = path.join(controller.inspect(agent.id).rootDir, 'denied.md');
    if (policy === 'guard') h.ctx.tools.guard(exec => exec.name === 'write' ? 'Controlled guard denial' : undefined);
    else h.ctx.on('tools/pre-execute', (exec, next) => exec.name === 'write' ? { kind: 'deny', reason: 'Controlled pre-execute denial' } : next());
    const result = await invoke(h, agent, target);
    assert.equal(result.isError, true);
    assert.match(messageText(result), /Controlled .* denial/);
    await missing(target);
    await controller.drain();
    let background = 0;
    h.model.respond = request => isAgentLoopRequest(request) ? { text: 'Acknowledged.' } : ++background === 1 ? { calls: [{ id: `background-${policy}`, name: 'write', arguments: { file_path: target, content: 'must not exist' } }] } : { text: 'Denied.' };
    await h.turn(agent, 'Remember another durable preference for future sessions.');
    await controller.drain();
    assert.equal(background, 2);
    const response = h.model.requests.filter(request => !isAgentLoopRequest(request)).at(-1).messages.findLast(message => message.role === 'tool');
    assert.equal(response.isError, true);
    assert.match(messageText(response), /Controlled .* denial/);
    await missing(target);
  } finally { await h.close(); }
});

test('real read-only policy denies both foreground and background memory writes', async () => {
  const h = await createHarness({ sandboxMode: 'read-only' });
  try {
    const { controller } = await h.memory({ enabled: true });
    const agent = await h.agent();
    const target = path.join(controller.inspect(agent.id).rootDir, 'denied.md');
    const result = await invoke(h, agent, target);
    await controller.drain();
    assert.equal(result.isError, true);
    assert.match(messageText(result), /read-only/);
    await missing(target);
    let background = 0;
    h.model.respond = request => isAgentLoopRequest(request) ? { text: 'Acknowledged.' } : ++background === 1 ? { calls: [{ id: 'background-denied', name: 'write', arguments: { file_path: target, content: 'must not exist' } }] } : { text: 'Write was denied.' };
    await h.turn(agent, 'Remember another durable preference for the future.');
    await controller.drain();
    assert.equal(background, 2);
    const response = h.model.requests.filter(request => !isAgentLoopRequest(request)).at(-1).messages.findLast(message => message.role === 'tool');
    assert.equal(response.isError, true);
    assert.match(messageText(response), /read-only/);
    await missing(target);
  } finally { await h.close(); }
});

test('workspace-write permits only the enabled memory exception and still denies outside targets', async () => {
  const h = await createHarness({ sandboxMode: 'workspace-write' });
  try {
    const { controller } = await h.memory({ enabled: true, extractionEnabled: false });
    const agent = await h.agent();
    const root = controller.inspect(agent.id).rootDir;
    const allowed = path.join(root, 'allowed.md');
    const accepted = await invoke(h, agent, allowed, 'enabled memory exception');
    assert.equal(accepted.isError, false);
    assert.equal(await readFile(allowed, 'utf8'), 'enabled memory exception');
    // Parent of this memory root is outside both the workspace and the child's
    // isolated platform temp. No write is expected, even though it shares a prefix.
    const outside = path.join(root, '..', 'outside.md');
    const refused = await invoke(h, agent, outside, 'must not escape memory root');
    assert.equal(refused.isError, true);
    assert.match(messageText(refused), /sandbox|workspace-write/i);
    await missing(outside);
  } finally { await h.close(); }
});
