import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, readFile, readdir, stat, utimes, symlink, open, rename } from 'node:fs/promises';
import { Lexer } from 'marked';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { parseDocument, isMap, parse } from 'yaml';
import {
  resolveProjectMemoryRoot, resolvePersistentAgentMemoryRoot, sanitizePersistentAgentMemoryKey, memoryFileRelativePath,
  resolveSafeMemoryFilePath, containsSensitiveMemoryPathSegment, createMemoryStorage,
  createMemoryCatalog, createReadState, formatMemoryIndexContent, formatProjectMemoryIndexContent,
  stampMemoryOriginSessionId, MEMORY_FILE_MAX_BYTES, readDreamLastConsolidatedAt,
  acquireDreamLock, restoreDreamLockAfterFailure, releaseDreamLock,
  projectPersistentAgentMemoryTools, loadPersistentAgentMemory,
} from '../../src/storage.js';
const testRoot = path.dirname(fileURLToPath(import.meta.url));
const upstreamRoot = new URL('../../assets/upstream/apps/zcode-cli/packages/core/src/', import.meta.url);
async function fixture(t) {
  const directory = await mkdtemp(path.join(testRoot, '.case-'));
  assert.equal(path.dirname(directory), testRoot);
  t.after(async () => { assert.equal(path.dirname(path.resolve(directory)), testRoot); await rm(directory, { recursive: true, force: true }); });
  const storageRoot = path.join(directory, 'profile');
  const workspacePath = path.join(directory, 'workspace');
  const store = createMemoryStorage({ storageRoot, workspacePath, sessionId: 'session-a' });
  await store.ensure();
  return { directory, storageRoot, workspacePath, store };
}
const fact = (body = 'Use a real database.', metadata = '  type: feedback') => `---\nname: database-policy\ndescription: Database testing policy\nmetadata:\n${metadata}\n---\n\n${body}\n`;
const code = expected => error => error.code === expected;
async function sourceExports(relative, names, context = {}) {
  const source = await readFile(new URL(relative, upstreamRoot), 'utf8');
  const stripped = stripTypeScriptTypes(source.replace(/^import\b[\s\S]*?;\s*/gm, ''), { mode: 'strip' }).replace(/\bexport\s+/gu, '');
  return vm.runInNewContext(`${stripped}\n({${names.join(',')}})`, context);
}

test('workspace roots match source slug/hash, Windows folding and identity isolation', () => {
  const expected = createHash('sha256').update('c:\\work\\my repo').digest('hex').slice(0, 16);
  const root = resolveProjectMemoryRoot({ storageRoot: 'D:\\profile', workspacePath: 'C:\\Work\\My Repo', platform: 'win32' });
  assert.equal(root, `D:\\profile\\memories\\projects\\my-repo-${expected}\\memory`);
  assert.equal(root, resolveProjectMemoryRoot({ storageRoot: 'D:\\profile', workspacePath: 'c:\\work\\my repo\\.', platform: 'win32' }));
  const a = resolveProjectMemoryRoot({ storageRoot: '/profile', workspacePath: '/alpha', workspaceIdentity: ' remote:a ', platform: 'linux' });
  const b = resolveProjectMemoryRoot({ storageRoot: '/profile', workspacePath: '/beta', workspaceIdentity: 'remote:a', platform: 'linux' });
  assert.equal(a, b);
  assert.notEqual(a, resolveProjectMemoryRoot({ storageRoot: '/profile', workspacePath: '/alpha', workspaceIdentity: 'remote:b', platform: 'linux' }));
  assert.match(a, /\/project-[a-f0-9]{16}\/memory$/u);
  assert.match(resolveProjectMemoryRoot({ storageRoot: '/profile', workspacePath: '/中文', platform: 'linux' }), /\/project-[a-f0-9]{16}\/memory$/u);
  assert.match(resolveProjectMemoryRoot({ storageRoot: '/profile', workspacePath: '/' + 'a'.repeat(70), platform: 'linux' }), new RegExp('/a{48}-[a-f0-9]{16}/memory$'));
});

test('custom scopes are isolated, sanitized, explicit and use .dsh not .zcode', async t => {
  const { directory, storageRoot, workspacePath } = await fixture(t);
  const common = { agentName: 'Reviewer/../!', storageRoot, workspaceRoot: workspacePath };
  assert.equal(resolvePersistentAgentMemoryRoot({ ...common, scope: 'user' }), path.join(storageRoot, 'agent-memory', 'Reviewer-----'));
  assert.equal(resolvePersistentAgentMemoryRoot({ ...common, scope: 'project' }), path.join(workspacePath, '.dsh', 'agent-memory', 'Reviewer-----'));
  assert.equal(resolvePersistentAgentMemoryRoot({ ...common, scope: 'local' }), path.join(workspacePath, '.dsh', 'agent-memory-local', 'Reviewer-----'));
  assert.throws(() => resolvePersistentAgentMemoryRoot({ ...common, scope: 'bad' }), code('INVALID_SCOPE'));
  assert.equal(await loadPersistentAgentMemory({ profile: { name: 'ordinary' }, memory: { enabled: true, storageRoot }, workspaceRoot: workspacePath }), undefined);
  for (const scope of ['user', 'project', 'local']) {
    const loaded = await loadPersistentAgentMemory({ profile: { name: 'review', memory: scope }, memory: { enabled: true, storageRoot }, workspaceRoot: workspacePath });
    assert.match(loaded.prompt, /# Persistent Agent Memory/u);
    assert.match(loaded.prompt, new RegExp(`Since this memory is ${scope}-scope`));
    assert.equal((await stat(loaded.rootDir)).isDirectory(), true);
  }
  assert.equal((await readdir(directory)).includes('.zcode'), false);
});

test('agent key sanitizer matches source UTF16 semantics including astral characters', async () => {
  const source = await sourceExports('subagent/persistent-memory.ts', ['sanitizePersistentAgentMemoryKey']);
  for (const name of ['', 'Reviewer/../!', 'agent😀', '👨‍💻', '中文', 'Allowed_-123']) {
    assert.equal(sanitizePersistentAgentMemoryKey(name), source.sanitizePersistentAgentMemoryKey(name), name);
  }
  assert.equal(sanitizePersistentAgentMemoryKey('agent😀'), 'agent--');
});

test('custom explicit tools projection keeps profiles without memory unchanged', () => {
  const ordinary = { name: 'ordinary', tools: ['Read'] };
  const definitions = { activeAgents: [ordinary, { name: 'review', memory: 'project', tools: ['Read', 'Write'] }] };
  assert.equal(projectPersistentAgentMemoryTools(definitions, { enabled: false }), definitions);
  const result = projectPersistentAgentMemoryTools(definitions, { enabled: true, storageRoot: '/p' });
  assert.equal(result.activeAgents[0], ordinary);
  assert.deepEqual(result.activeAgents[1].tools, ['Read', 'Write', 'Edit']);
  assert.equal(projectPersistentAgentMemoryTools(result, { enabled: true, storageRoot: '/p' }), result);
});

test('path containment, traversal, lowercase extension and sensitive Windows aliases', () => {
  assert.equal(memoryFileRelativePath('C:\\m', 'C:\\m\\a.md'), 'a.md');
  assert.equal(memoryFileRelativePath('C:\\m', 'C:\\more\\a.md'), undefined);
  assert.equal(memoryFileRelativePath('/m', '/m'), undefined);
  const safe = filePath => resolveSafeMemoryFilePath({ rootDir: '/m', workingDirectory: '/m', workspaceRoot: '/workspace', filePath });
  assert.equal(safe('good.md'), path.resolve('/m', 'good.md'));
  assert.equal(safe('Upper.md'), path.resolve('/m', 'Upper.md'));
  for (const input of ['../out.md', 'x/../good.md', '.git/notes.md', '.gIt./notes.md', '.git:stream/a.md', 'CON.md', 'a.MD', 'a.md ', 'a.md:stream', 'a\\..\\b.md']) assert.equal(safe(input), undefined, input);
  assert.equal(containsSensitiveMemoryPathSegment('x/HooKS. /file.md'), true);
});

test('index cleaning and truncation are exact upstream behavior across difficult Markdown', async () => {
  const source = await sourceExports('memory/index-content.ts', ['formatMemoryIndexContent', 'formatProjectMemoryIndexContent'], { Lexer });
  const cases = ['', '  a\n b  ', '---\nsecret: ignored\n---\n<!-- hidden -->\n- [A](a.md)',
    'paragraph <!-- inline stays -->\n\n> <!-- quote stays -->\n\n- <!-- list stays -->\n\n```html\n<!-- code stays -->\n```\n\n<!-- top removed -->',
    Array.from({ length: 201 }, (_, n) => `line ${n}`).join('\n'), '中'.repeat(25001), '😀'.repeat(12501),
    Array.from({ length: 202 }, () => 'x'.repeat(200)).join('\n'), '\uFEFF---\nname: preserves-source-bom-case\n---\nbody'];
  for (const input of cases) {
    assert.equal(formatMemoryIndexContent(input), source.formatMemoryIndexContent(input));
    assert.equal(formatProjectMemoryIndexContent(input), source.formatProjectMemoryIndexContent(input));
  }
  const cleaned = formatProjectMemoryIndexContent(cases[3]);
  assert.match(cleaned, /inline stays/u); assert.match(cleaned, /quote stays/u); assert.match(cleaned, /list stays/u); assert.match(cleaned, /code stays/u);
  assert.doesNotMatch(cleaned, /top removed/u);
  assert.match(formatMemoryIndexContent('中'.repeat(25001)), /24\.4KB/u); // JS characters, not UTF8 bytes.
});

test('origin stamping matches upstream, retains original origin, invalid YAML, comments and CRLF', async () => {
  const source = await sourceExports('memory/origin-session.ts', ['stampMemoryOriginSessionId'], { parseDocument, isMap, memoryFileRelativePath });
  const inputs = [fact(), fact('Fact', '  type: user\n  originSessionId: existing\n  node_type: old'),
    '---\nname: hi\n---\nbody', '---\nmetadata: nope\n---\nbody', '---\nmetadata: [nope]\n---\nbody',
    '---\nmetadata: {\n---\nbody', '\uFEFF' + fact().replace(/\n/gu, '\r\n'), fact('Fact', '  type: feedback # preserve\n  node_type: wrong')];
  for (const content of inputs) {
    const input = { content, filePath: path.resolve('/mem', 'a.md'), memoryRoot: path.resolve('/mem'), sessionId: 'session-123' };
    assert.equal(stampMemoryOriginSessionId(input), source.stampMemoryOriginSessionId(input));
  }
  const stamped = stampMemoryOriginSessionId({ content: fact(), filePath: '/mem/a.md', memoryRoot: '/mem', sessionId: 'session-123' });
  const metadata = parse(stamped.split('---')[1]).metadata;
  assert.equal(metadata.originSessionId, 'session-123'); assert.equal(metadata.node_type, 'memory');
});

test('store freezes root and index promise; no reload after writes or missing first index', async t => {
  const { store } = await fixture(t);
  assert.equal(Object.isFrozen(store), true);
  const missingPromise = store.loadIndexOnce();
  assert.equal(missingPromise, store.loadIndexOnce());
  const first = await missingPromise;
  assert.equal(first.content, ''); assert.equal(first.indexPath, path.join(store.rootDir, 'MEMORY.md'));
  await store.write('MEMORY.md', '- [new](new.md)');
  assert.equal((await store.loadIndexOnce()).content, '');
  const cold = createMemoryStorage({ rootDir: store.rootDir });
  const loaded = await cold.loadIndexOnce();
  assert.equal(loaded.content, '- [new](new.md)'); assert.equal(loaded.raw, loaded.rawContent);
  assert.equal(loaded.readState.size, 1);
});

test('empty or unreadable frozen index grants no read authority and abort still propagates', async t => {
  const { store } = await fixture(t);
  await store.write('MEMORY.md', '<!-- no visible index -->');
  const empty = await store.loadIndexOnce();
  assert.equal(empty.content, ''); assert.equal(empty.readState.size, 0);
  await writeFile(store.resolve('MEMORY.md'), 'x'.repeat(MEMORY_FILE_MAX_BYTES + 1));
  const unreadable = createMemoryStorage({ rootDir: store.rootDir });
  const failure = await unreadable.loadIndexOnce();
  assert.equal(failure.content, ''); assert.equal(failure.readState.size, 0); assert.equal(failure.indexError.code, 'FILE_TOO_LARGE');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createMemoryStorage({ rootDir: store.rootDir }).loadIndexOnce({ signal: controller.signal }), { name: 'AbortError' });
});

test('formatted frozen index keeps raw content but cannot authorize mutation until Read', async t => {
  const { store } = await fixture(t);
  const raw = '---\nname: index\n---\n<!-- private comment -->\n- [A](a.md)\n';
  await store.write('MEMORY.md', raw);
  const index = await store.loadIndexOnce();
  assert.equal(index.content, '- [A](a.md)');
  const observation = index.readState.values().next().value;
  assert.equal(observation.content, raw); assert.equal(observation.isPartialView, true);
  await assert.rejects(store.write('MEMORY.md', 'replace', { readState: index.readState }), code('READ_REQUIRED'));
  await assert.rejects(store.edit('MEMORY.md', '- [A](a.md)', '- [B](b.md)', { readState: index.readState }), code('READ_REQUIRED'));
  await store.read('MEMORY.md', { readState: index.readState });
  assert.equal(index.readState.values().next().value.isPartialView, false);
  const changed = await store.edit('MEMORY.md', '- [A](a.md)', '- [B](b.md)', { readState: index.readState });
  assert.match(changed.content, /\[B\]/u);
});

test('explicit Read ranges follow source range-not-partial mutation authority', async t => {
  const { store } = await fixture(t);
  await store.write('Title.md', 'one\ntwo\nthree');
  const state = store.createReadState();
  const read = await store.read('Title.md', { readState: state, offset: 2, limit: 1 });
  assert.equal(read.content, 'two'); assert.equal(read.isRangeView, true); assert.equal(read.isPartialView, false);
  assert.equal((await store.edit('Title.md', 'three', 'THREE', { readState: state })).content, 'one\ntwo\nTHREE');
  await store.read('Title.md', { readState: state, offset: 1, limit: 1 });
  assert.equal((await store.write('Title.md', 'new full content', { readState: state })).content, 'new full content');
  await assert.rejects(store.read('title.md'), code('INVALID_PATH'));
});

test('read/write/edit enforce independent read-state, partial-view rejection and literal replacements', async t => {
  const { store } = await fixture(t);
  const created = await store.write('policy.md', fact());
  assert.equal(created.before, null); assert.equal(created.operation, 'create');
  assert.match(created.after, /originSessionId: session-a/u);
  await assert.rejects(store.write('policy.md', 'overwrite'), code('READ_REQUIRED'));
  await assert.rejects(store.edit('policy.md', 'real database', 'live database'), code('READ_REQUIRED'));
  const state = store.createReadState();
  const read = await store.read('policy.md', { readState: state });
  assert.equal(read.totalLines, read.content.split('\n').length); assert.equal(read.isPartialView, false);
  const isolated = createReadState(state);
  const entry = isolated.values().next().value; entry.content = 'mutated copy';
  assert.notEqual(state.values().next().value.content, 'mutated copy');
  const edited = await store.edit('policy.md', 'real database', '$& literal', { readState: state });
  assert.match(edited.after, /\$& literal/u); assert.equal(edited.before, read.content); assert.equal(edited.operation, 'update');
  await assert.rejects(store.edit('policy.md', 'Use', 'Try', { readState: isolated }), code('FILE_CHANGED'));
  const partial = store.createReadState(); await store.read('policy.md', { readState: partial, offset: 1, limit: 2 });
  // Explicit ranges are not partial views upstream. Simulate genuinely truncated
  // provider-visible output, which must never authorize Write or Edit.
  partial.values().next().value.isPartialView = true;
  await assert.rejects(store.write('policy.md', 'replace', { readState: partial }), code('READ_REQUIRED'));
  await assert.rejects(store.edit('policy.md', '$& literal', 'x', { readState: partial }), code('READ_REQUIRED'));
  await store.write('repeat.md', 'a a');
  const repeatState = store.createReadState(); await store.read('repeat.md', { readState: repeatState });
  await assert.rejects(store.edit('repeat.md', 'a', 'b', { readState: repeatState }), code('EDIT_MATCH'));
  assert.equal((await store.edit('repeat.md', 'a', '$&', { readState: repeatState, replaceAll: true })).content, '$& $&');
});

test('ABA modification is rejected even when bytes and mtime are restored', async t => {
  const { store } = await fixture(t);
  const state = store.createReadState();
  await store.write('aba.md', 'initial'); await store.read('aba.md', { readState: state });
  const target = store.resolve('aba.md'); const previous = await stat(target);
  await writeFile(target, 'changed'); await writeFile(target, 'initial'); await utimes(target, previous.atime, previous.mtime);
  await assert.rejects(store.edit('aba.md', 'initial', 'unsafe', { readState: state }), code('FILE_CHANGED'));
  assert.equal(await readFile(target, 'utf8'), 'initial');
});

test('concurrent stale writers serialize and only one commits', async t => {
  const { store } = await fixture(t);
  await store.write('counter.md', 'old');
  const state = store.createReadState(); await store.read('counter.md', { readState: state });
  const results = await Promise.allSettled([store.write('counter.md', 'first', { readState: createReadState(state) }), store.write('counter.md', 'second', { readState: createReadState(state) })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'FILE_CHANGED');
});

test('aborted operations cannot write/delete and queued late calls leave no temporary files', async t => {
  const { store } = await fixture(t);
  const state = store.createReadState(); await store.write('a.md', 'keep', { readState: state });
  const controller = new AbortController(); controller.abort();
  for (const call of [() => store.write('late.md', 'bad', { signal: controller.signal }), () => store.edit('a.md', 'keep', 'bad', { signal: controller.signal, readState: state }), () => store.remove('a.md', { signal: controller.signal }), () => store.read('a.md', { signal: controller.signal })]) await assert.rejects(call(), { name: 'AbortError' });
  assert.equal((await store.read('a.md')).content, 'keep');
  assert.deepEqual(await readdir(store.rootDir), ['a.md']);
  const large = new AbortController();
  const pending = store.write('large.md', 'x'.repeat(MEMORY_FILE_MAX_BYTES), { signal: large.signal });
  large.abort(); await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(await readdir(store.rootDir), ['a.md']);
});

test('abort after temporary data is flushed still prevents the atomic commit', async t => {
  const { store } = await fixture(t);
  const state = store.createReadState(); await store.write('a.md', 'keep', { readState: state });
  const probe = await open(store.resolve('a.md'), 'r'); const prototype = Object.getPrototypeOf(probe); await probe.close();
  const controller = new AbortController(); const original = prototype.sync;
  prototype.sync = async function (...args) { const result = await original.apply(this, args); controller.abort(); return result; };
  try { await assert.rejects(store.write('a.md', 'must not commit', { signal: controller.signal, readState: state }), { name: 'AbortError' }); }
  finally { prototype.sync = original; }
  assert.equal((await store.read('a.md')).content, 'keep');
  assert.deepEqual(await readdir(store.rootDir), ['a.md']);
});

test('file limit is exactly 5MiB and catalog rejects case aliases and traversal', async t => {
  const { store, storageRoot } = await fixture(t);
  await store.write('MEMORY.md', 'index');
  await store.write('small.md', 'small');
  await store.write('limit.md', 'x'.repeat(MEMORY_FILE_MAX_BYTES));
  await assert.rejects(store.write('large.md', 'x'.repeat(MEMORY_FILE_MAX_BYTES + 1)), code('FILE_TOO_LARGE'));
  await writeFile(path.join(store.rootDir, 'oversize.md'), 'x'.repeat(MEMORY_FILE_MAX_BYTES + 1));
  const catalog = createMemoryCatalog({ storageRoot });
  const [workspace] = await catalog.listWorkspaces();
  assert.equal(workspace.files[0].kind, 'index'); assert.equal(typeof workspace.updatedAt, 'number');
  assert.equal((await catalog.readFile(workspace.id, 'limit.md')).content.length, MEMORY_FILE_MAX_BYTES);
  await assert.rejects(catalog.readFile(workspace.id, 'oversize.md'), code('FILE_TOO_LARGE'));
  await assert.rejects(catalog.readFile(workspace.id, 'Small.md'), code('INVALID_PATH'));
  await assert.rejects(catalog.readFile(workspace.id.toUpperCase(), 'small.md'), code('INVALID_PATH'));
  for (const filename of ['../small.md', 'a/../small.md', 'small.md:stream', '/small.md', 'C:\\small.md']) await assert.rejects(catalog.readFile(workspace.id, filename), code('INVALID_PATH'));
  await assert.rejects(catalog.readFile(workspace.id, 'missing.md'), code('FILE_NOT_FOUND'));
  const filtered = await catalog.listWorkspaces({ query: 'SMALL' }); assert.deepEqual(filtered[0].files.map(file => file.name), ['small.md']);
  const remote = createMemoryCatalog({ storageRoot, remote: true });
  assert.deepEqual(await remote.listWorkspaces(), []); await assert.rejects(remote.readFile(workspace.id, 'small.md'), code('INVALID_PATH'));
});

test('catalog hides empty/nested-only workspaces, exposes top-level files, and refuses nested reads', async t => {
  const { store, storageRoot } = await fixture(t);
  const catalog = createMemoryCatalog({ storageRoot });
  assert.deepEqual(await catalog.listWorkspaces(), []);
  await store.write('nested/deep.md', fact('nested fact'));
  assert.deepEqual(await catalog.listWorkspaces(), []);
  assert.equal((await store.manifest())[0].filename, 'nested/deep.md');
  await store.write('Top.md', fact('top fact'));
  const [workspace] = await catalog.listWorkspaces();
  assert.deepEqual(workspace.files.map(file => file.name), ['Top.md']);
  assert.match((await catalog.readFile(workspace.id, 'Top.md')).content, /top fact/u);
  await assert.rejects(catalog.readFile(workspace.id, 'top.md'), code('INVALID_PATH'));
  await assert.rejects(catalog.readFile(workspace.id, 'nested/deep.md'), code('INVALID_PATH'));
  await assert.rejects(catalog.readFile(workspace.id, 'nested\\deep.md'), code('INVALID_PATH'));
});

test('symlinked memory files, nested directories and root ancestors are refused', async t => {
  const { directory, store, storageRoot } = await fixture(t);
  const outside = path.join(directory, 'outside'); await mkdir(outside); await writeFile(path.join(outside, 'secret.md'), 'outside');
  await symlink(outside, path.join(store.rootDir, 'nested'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(store.read('nested/secret.md'), code('INVALID_PATH'));
  await assert.rejects(store.write('nested/new.md', 'bad'), code('INVALID_PATH'));
  assert.equal((await store.list()).length, 0);
  const rootLink = path.join(directory, 'root-link'); await symlink(outside, rootLink, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(createMemoryStorage({ rootDir: path.join(rootLink, 'memory') }).ensure(), code('INVALID_PATH'));
  try {
    await symlink(path.join(outside, 'secret.md'), path.join(store.rootDir, 'linked.md'), 'file');
    await assert.rejects(store.read('linked.md'), code('INVALID_PATH'));
  } catch (error) { if (error.code !== 'EPERM') throw error; t.diagnostic('File symlink privilege unavailable; directory junction tests still passed.'); }
  const catalog = createMemoryCatalog({ storageRoot });
  assert.deepEqual(await catalog.listWorkspaces(), []);
});

test('stable handle detects in-place writes during read', async t => {
  const { store } = await fixture(t);
  await store.write('racy.md', 'before');
  const target = store.resolve('racy.md');
  const probe = await open(target, 'r'); const prototype = Object.getPrototypeOf(probe); await probe.close();
  const original = prototype.read; let mutated = false;
  prototype.read = async function (...args) {
    const result = await original.apply(this, args);
    if (!mutated) { mutated = true; await writeFile(target, 'after!'); }
    return result;
  };
  try { await assert.rejects(store.read('racy.md'), code('FILE_CHANGED')); }
  finally { prototype.read = original; }
});

test('stable handle detects a path replaced during read', async t => {
  const { store } = await fixture(t);
  await store.write('racy.md', 'before');
  const target = store.resolve('racy.md'); const replacement = path.join(store.rootDir, 'replacement.tmp');
  await writeFile(replacement, 'after!');
  const probe = await open(target, 'r'); const prototype = Object.getPrototypeOf(probe); await probe.close();
  const original = prototype.read; let mutated = false; let windowsBlockedReplacement = false;
  prototype.read = async function (...args) {
    const result = await original.apply(this, args);
    if (!mutated) {
      mutated = true;
      try { await rename(replacement, target); }
      catch (error) {
        // Windows can disallow replacing a file while its verified handle is open.
        // That OS guarantee also prevents mixed/redirected reads; do not bypass it.
        if (process.platform === 'win32' && error.code === 'EPERM') windowsBlockedReplacement = true;
        else throw error;
      }
    }
    return result;
  };
  try {
    const result = await store.read('racy.md').then(value => ({ value }), error => ({ error }));
    if (windowsBlockedReplacement) { assert.equal(result.value.content, 'before'); t.diagnostic('Windows prevented replacement of the open verified handle (EPERM).'); }
    else assert.equal(result.error?.code, 'FILE_CHANGED');
  } finally { prototype.read = original; }
});

test('manifest preserves preview30 metadata and newest200; skips index and unsafe paths', async t => {
  const { store } = await fixture(t);
  await store.write('MEMORY.md', 'index');
  const base = Date.now() - 100000;
  for (let n = 0; n < 202; n++) {
    const target = path.join(store.rootDir, `fact-${String(n).padStart(3, '0')}.md`);
    await writeFile(target, fact(`body ${n}`)); await utimes(target, (base + n * 100) / 1000, (base + n * 100) / 1000);
  }
  await writeFile(path.join(store.rootDir, 'beyond-preview.md'), '---\n' + '\n'.repeat(31) + 'description: too late\nmetadata:\n  type: user\n---\nbody');
  const manifest = await store.manifest();
  assert.equal(manifest.length, 200); assert.equal(manifest[0].filename, 'beyond-preview.md');
  assert.equal(manifest[0].description, undefined); assert.equal(manifest[1].filename, 'fact-201.md');
  assert.equal(manifest[1].description, 'Database testing policy'); assert.equal(manifest[1].type, 'feedback');
  assert.equal(manifest.some(entry => entry.filename === 'MEMORY.md'), false);
});

test('manifest scan failures become an empty manifest but cancellation remains observable', async t => {
  const { directory, store } = await fixture(t);
  const outside = path.join(directory, 'outside-manifest'); await mkdir(outside);
  const linkedRoot = path.join(directory, 'linked-manifest'); await symlink(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepEqual(await createMemoryStorage({ rootDir: linkedRoot }).manifest(), []);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(store.manifest({ signal: controller.signal }), { name: 'AbortError' });
});

test('recalled bodies use complete UTF8 lines, 200 lines, stale warning and original order', async t => {
  const { store } = await fixture(t);
  await store.write('utf8.md', Array(100).fill('中'.repeat(30)).join('\n'));
  await store.write('lines.md', Array.from({ length: 205 }, (_, n) => `line ${n}`).join('\n'));
  await store.write('giant-line.md', '中'.repeat(1500));
  const nowMs = Date.now();
  const entries = ['utf8.md', 'lines.md', 'giant-line.md'].map(filename => ({ filename, filePath: store.resolve(filename), mtimeMs: nowMs - 3 * 86400000 }));
  const recalls = await store.readRecalledMemories({ entries, nowMs });
  assert.deepEqual(recalls.map(entry => entry.filePath), entries.map(entry => entry.filePath));
  assert.equal(recalls[0].limit, 45); assert.match(recalls[0].content, /4096 byte limit/u); assert.match(recalls[0].header, /3 days old/u);
  assert.equal(recalls[1].limit, 200); assert.match(recalls[1].content, /first 200 lines/u);
  assert.equal(recalls[2].limit, 0); assert.match(recalls[2].content, /^\n\n> This memory/u);
  assert.ok(recalls.every(entry => entry.revisionId && typeof entry.sizeBytes === 'number'));
});

test('Dream lock PID freshness, stale recovery and success timestamps are persisted', async t => {
  const { store } = await fixture(t);
  assert.equal(await readDreamLastConsolidatedAt(store.rootDir), 0);
  assert.equal(await acquireDreamLock({ memoryRoot: store.rootDir }), 0);
  assert.equal(await acquireDreamLock({ memoryRoot: store.rootDir }), null);
  await restoreDreamLockAfterFailure({ memoryRoot: store.rootDir, priorMtimeMs: 0 });
  assert.equal(await readDreamLastConsolidatedAt(store.rootDir), 0);
  await acquireDreamLock({ memoryRoot: store.rootDir });
  const old = Date.now() - 2 * 3600000;
  await utimes(path.join(store.rootDir, '.consolidate-lock'), old / 1000, old / 1000);
  const prior = await acquireDreamLock({ memoryRoot: store.rootDir }); assert.ok(Math.abs(prior - old) < 1);
  await restoreDreamLockAfterFailure({ memoryRoot: store.rootDir, priorMtimeMs: prior });
  assert.ok(Math.abs(await readDreamLastConsolidatedAt(store.rootDir) - old) < 1);
  assert.equal(await readFile(path.join(store.rootDir, '.consolidate-lock'), 'utf8'), '');
  await acquireDreamLock({ memoryRoot: store.rootDir }); const success = Date.now();
  await releaseDreamLock({ memoryRoot: store.rootDir, nowMs: success });
  assert.ok(Math.abs(await readDreamLastConsolidatedAt(store.rootDir) - success) < 1);
  assert.deepEqual(await store.list(), []);
});
