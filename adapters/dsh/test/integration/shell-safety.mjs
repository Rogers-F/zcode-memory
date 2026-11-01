import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHarness, isAgentLoopRequest } from './runtime.mjs';

for (const variant of ['redirected-workdir', 'unparsed-command', 'run-in-background']) test(`background pwsh rejects ${variant} without falling through to the shell`, async () => {
  const h = await createHarness();
  try {
    await h.shell();
    const { controller } = await h.memory({ enabled: true });
    const agent = await h.agent();
    const root = controller.inspect(agent.id).rootDir;
    const victim = path.join(root, 'victim.md');
    const redirected = path.join(h.workspace, 'alternate');
    await mkdir(redirected);
    await writeFile(victim, 'The sentinel must survive.');
    let fallthroughs = 0;
    // An observation tripwire at the public tools/execute seam, after memory's
    // interceptor: count any attempted fallback and prevent process execution.
    h.ctx.on('tools/execute', (exec, next) => {
      if (exec.name !== 'pwsh') return next();
      fallthroughs++;
      return { isError: true, error: { message: 'SHELL_FALLTHROUGH_TRIPWIRE' }, content: [{ type: 'text', text: 'SHELL_FALLTHROUGH_TRIPWIRE' }] };
    });
    const relative = path.relative(h.workspace, victim);
    const malicious = variant === 'redirected-workdir'
      ? { command: `Remove-Item -LiteralPath '${relative}'`, workdir: redirected }
      : variant === 'unparsed-command'
        ? { command: `Get-Content -LiteralPath '${victim}'; Write-Output 'not allowed'` }
        : { command: `Get-Content -LiteralPath '${victim}'`, run_in_background: true };
    let background = 0;
    h.model.respond = request => {
      if (isAgentLoopRequest(request)) return { text: 'Acknowledged.' };
      background++;
      if (background === 1) return { calls: [{ id: 'read-sentinel', name: 'read', arguments: { file_path: victim } }] };
      if (background === 2) return { calls: [{ id: 'unsafe-shell', name: 'pwsh', arguments: { description: 'Controlled shell security probe', ...malicious } }] };
      return { text: 'The shell request was refused.' };
    };
    await h.turn(agent, 'Remember my durable preference and check saved memory.');
    await controller.drain();
    assert.equal(background, 3);
    const last = h.model.requests.filter(request => !isAgentLoopRequest(request)).at(-1);
    const rejected = last.messages.findLast(message => message.role === 'tool');
    assert.equal(rejected.isError, true);
    assert.equal(fallthroughs, 0, 'unsafe background shell calls must not reach the host shell executor');
    assert.equal(await readFile(victim, 'utf8'), 'The sentinel must survive.');
  } finally { await h.close(); }
});

test('background relative paths remain bound to the captured directory after the session changes cwd', async () => {
  const h = await createHarness();
  const release = Promise.withResolvers();
  try {
    const { controller } = await h.memory({ enabled: true });
    const agent = await h.agent();
    const root = controller.inspect(agent.id).rootDir;
    await h.ctx.workingDirectory.set(agent, root, new AbortController().signal);
    const entered = Promise.withResolvers();
    let background = 0;
    h.model.respond = async request => {
      if (isAgentLoopRequest(request)) return { text: 'Acknowledged.' };
      if (++background === 1) {
        entered.resolve();
        await release.promise;
        return { calls: [{ id: 'frozen-relative-write', name: 'write', arguments: { file_path: 'frozen.md', content: '---\nname: frozen\nmetadata:\n  type: user\n---\nThe extraction directory stays frozen.\n' } }] };
      }
      return { text: 'Saved in the original memory directory.' };
    };
    await h.turn(agent, 'Remember this durable preference in the memory directory.');
    await entered.promise;
    await h.ctx.workingDirectory.set(agent, h.workspace, new AbortController().signal);
    release.resolve();
    await controller.drain();
    assert.equal(background, 2);
    const content = await readFile(path.join(root, 'frozen.md'), 'utf8');
    assert.ok(content.includes(`originSessionId: ${agent.id}`));
  } finally { release.resolve(); await h.close(); }
});

test('foreground relative memory writes follow the real session current working directory', async () => {
  const h = await createHarness();
  try {
    const { controller } = await h.memory({ enabled: true, extractionEnabled: false });
    const agent = await h.agent();
    const root = controller.inspect(agent.id).rootDir;
    await h.ctx.workingDirectory.set(agent, root, new AbortController().signal);
    let calls = 0;
    h.model.respond = () => ++calls === 1 ? { calls: [{ id: 'current-directory-write', name: 'write', arguments: { file_path: 'current.md', content: '---\nname: current\nmetadata:\n  type: user\n---\nFollow the current directory.\n' } }] } : { text: 'Saved.' };
    await h.turn(agent, 'Save the requested memory in the current directory.');
    const content = await readFile(path.join(root, 'current.md'), 'utf8');
    assert.ok(content.includes(`originSessionId: ${agent.id}`), `the memory interceptor must own this write; actual content: ${JSON.stringify(content)}; root=${root}; cwd=${h.ctx.workingDirectory.get(agent.session)}`);
    const result = h.model.requests.at(-1).messages.findLast(message => message.role === 'tool');
    assert.equal(result.isError, false);
  } finally { await h.close(); }
});
