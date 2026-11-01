// Regression: mount the shipped plugin object itself, without an apply() wrapper
// that can accidentally swallow an invalid Cordis effect return value.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, pluginEntry } from './runtime.mjs';

for (const enabled of [false, true]) {
  test(`unwrapped plugin activates through real Cordis (memory enabled=${enabled})`, async () => {
    const h = await createHarness();
    try {
      const plugin = await import(pluginEntry);
      const fiber = h.ctx.plugin(plugin, { enabled });
      await assert.doesNotReject(() => fiber.await(), 'Shipped plugin must activate without TypeError: Invalid effect');
      assert.ok(plugin.getController(h.ctx), 'Controller is discoverable without returning an object from apply');
    } finally { await h.close(); }
  });
}

test('unwrapped plugin activates with real in-process Connection and unregisters routes on unload', async () => {
  const h = await createHarness();
  try {
    const connection = await h.connection();
    const plugin = await import(pluginEntry);
    const fiber = h.ctx.plugin(plugin, { enabled: false });
    await assert.doesNotReject(() => fiber.await(), 'Connection-bearing activation must use the same Cordis plugin contract');
    const handler = connection.createSharedFetchHandler('/api');
    const response = await handler.fetch(new Request('http://localhost/api/zcode-memory/settings'), { principal: { kind: 'owner' } });
    assert.equal(response.status, 200);
    await fiber.dispose();
    const after = await handler.fetch(new Request('http://localhost/api/zcode-memory/settings'), { principal: { kind: 'owner' } });
    assert.equal(after.status, 404);
  } finally { await h.close(); }
});
