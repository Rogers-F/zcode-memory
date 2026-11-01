import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHarness, createVolatile, updateVolatile } from './runtime.mjs';

const rendered = request => request.messages.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n');

test('real JSONL cold resume rebuilds same-id state and replaces the stale frozen index', async () => {
  const h = await createHarness();
  try {
    await h.persistence();
    const { controller } = await h.memory({ enabled: true, extractionEnabled: false });
    const seed = await h.agent();
    const root = controller.inspect(seed.id).rootDir;
    await writeFile(path.join(root, 'MEMORY.md'), '- [OLD_INDEX_MARKER](old.md) — stale\n');
    const first = await h.agent();
    await h.turn(first, 'Open a session with the original index.');
    assert.match(rendered(h.model.requests.at(-1)), /OLD_INDEX_MARKER/);
    const id = first.id;
    await h.dispose(first);
    assert.ok(!controller.inspect(id) || controller.inspect(id).closed, 'the disposed state is retired or closed');
    await writeFile(path.join(root, 'MEMORY.md'), '- [FRESH_INDEX_MARKER](fresh.md) — refreshed\n');
    const resumed = await h.resume(id);
    assert.notEqual(resumed, first);
    assert.equal(controller.inspect(id).enabled, true);
    assert.equal(controller.inspect(id).closed, false);
    await h.turn(resumed, 'Continue from the persisted conversation.');
    const request = h.model.requests.at(-1);
    assert.match(rendered(request), /FRESH_INDEX_MARKER/);
    assert.doesNotMatch(rendered(request), /OLD_INDEX_MARKER/);
    assert.equal(request.messages.filter(message => message.source?.kind === 'zcode-memory-index').length, 1);
  } finally { await h.close(); }
});

test('real in-process Connection exact routes require an owner Peer and expose only local memory data', async () => {
  const h = await createHarness();
  try {
    const connection = await h.connection();
    const { controller, config, unload } = await h.memory({ enabled: true, extractionEnabled: false });
    const agent = await h.agent();
    await writeFile(path.join(controller.inspect(agent.id).rootDir, 'MEMORY.md'), '- [Route fixture](route.md) — route fixture\n');
    const owner = connection.createPeer({ principal: { kind: 'owner' }, interactions: 'none' });
    const guest = connection.createPeer({ principal: { kind: 'integration-guest', id: 'untrusted' }, interactions: 'none' });
    const carrier = connection.createSharedFetchHandler('/api');
    const request = (endpoint, peer = owner, init) => carrier.fetch(new Request(`http://integration.invalid/api/zcode-memory/${endpoint}`, init), peer);
    assert.equal((await request('settings', guest)).status, 403);
    const settings = await request('settings');
    assert.equal(settings.status, 200);
    assert.equal(settings.headers.get('cache-control'), 'no-store');
    assert.equal((await settings.json()).enabled, true);
    const listed = await request('workspaces');
    assert.equal(listed.status, 200);
    const { workspaces } = await listed.json();
    assert.ok(workspaces.length > 0);
    assert.equal('rootDir' in workspaces[0], false, 'the route must not disclose host roots');
    const workspace = workspaces.find(item => item.id === path.basename(path.dirname(controller.inspect(agent.id).rootDir)));
    assert.ok(workspace);
    const file = await request(`file?workspaceId=${encodeURIComponent(workspace.id)}&fileName=MEMORY.md`);
    assert.equal(file.status, 200);
    assert.match(JSON.stringify(await file.json()), /Route fixture/);
    const escaped = await request(`file?workspaceId=${encodeURIComponent(workspace.id)}&fileName=..%2Foutside.md`);
    assert.equal(escaped.status, 400);
    assert.equal((await request('settings', owner, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"enabled":true,"unexpected":1}' })).status, 400);
    updateVolatile(config.enabled, createVolatile(false));
    assert.equal((await request('workspaces')).status, 403);
    await unload();
    assert.equal((await request('settings')).status, 404, 'unload removes exact routes');
    await owner.dispose();
    await guest.dispose();
  } finally { await h.close(); }
});
