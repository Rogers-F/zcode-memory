/**
 * Copyright 2026 Z.AI Co., Ltd. Licensed under Apache-2.0.
 * MODIFIED for DSH (2026-10-19): combined ESM storage module, dependency-injected
 * roots, .dsh custom scopes, hardened bounded handle reads, isolated read state,
 * cancellation-safe atomic commits and local-only catalog. Exact upstream sources
 * and SHA256 provenance are in assets/upstream and assets/source-manifest.json.
 *
 * Interface: all filesystem effects live here. Instances freeze their root at
 * construction; loadIndexOnce caches its first Promise (including a missing index).
 * No constructor reads/writes files. Existing Write/Edit require a stable Read in
 * the supplied Map. A read state is a capability: never accept one from the model.
 * Errors have stable codes; calls propagate failures instead of claiming success.
 */
import path from 'node:path';
import unifiedCore from '../shared.cjs';
import { createHash, randomUUID } from 'node:crypto';
import { constants, lstatSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, unlink, utimes } from 'node:fs/promises';
import { Lexer } from 'marked';
import { isMap, parseDocument, parse as parseYaml } from 'yaml';

/**
 * @typedef {{content:string,path:string,filePath:string,updatedAt:number,mtimeMs:number,
 * sizeBytes:number,revisionId:string,revision:{id:string},snapshot:string,
 * totalLines?:number,isPartialView?:boolean,isRangeView?:boolean,readAt?:Date,offset?:number,limit?:number}} MemoryRead
 * @typedef {Map<string,MemoryRead>} MemoryReadState
 * @typedef {{signal?:AbortSignal,readState?:MemoryReadState,sessionId?:string,
 * offset?:number,limit?:number,replaceAll?:boolean}} MemoryOperationOptions
 * @typedef {{storageRoot?:string,cliStorageRoot?:string,workspacePath?:string,
 * workspaceIdentity?:string,rootDir?:string,sessionId?:string}} MemoryStorageOptions
 * @typedef {{filename:string,filePath:string,mtimeMs:number,description?:string,
 * type?:'user'|'feedback'|'project'|'reference'}} MemoryManifestEntry
 */
export const MEMORY_INDEX_LINE_LIMIT = 200;
export const MEMORY_INDEX_CHARACTER_LIMIT = 25_000;
export const MEMORY_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const MEMORY_RECALL_TYPES = Object.freeze(['user', 'feedback', 'project', 'reference']);
const MANIFEST_FILE_LIMIT = 200;
const MANIFEST_PREVIEW_LINE_LIMIT = 30;
const MEMORY_CONTENT_LINE_LIMIT = 200;
const MEMORY_CONTENT_BYTE_LIMIT = 4096;
const DREAM_LOCK_FILE = '.consolidate-lock';
const DREAM_LOCK_FRESH_MS = 60 * 60 * 1000;
const SENSITIVE_SEGMENTS = new Set(['.git', 'hooks', '.husky', '.githooks', 'node_modules', '.vscode', '.idea', 'head', 'config', 'objects', 'refs', '.claude', '.zcode', '.dsh', 'skills', 'commands', 'agents', '.cargo', '.devcontainer', '.yarn', '.mvn']);
const FRONTMATTER = /^(\uFEFF?---(?:\r\n|\n))([\s\S]*?)((?:\r\n|\n)---)(?=(?:\r\n|\n)|$)/u;
const mutationQueues = new Map();

function failure(code, message, cause) { return Object.assign(new Error(message, { cause }), { code }); }
function checkAbort(signal) { signal?.throwIfAborted(); }
function isMissing(error) { return error?.code === 'ENOENT' || error?.code === 'FILE_NOT_FOUND'; }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function pathFlavor(...values) { return values.some(value => /^(?:[A-Za-z]:[\\/]|\\\\)/u.test(value)) ? path.win32 : path; }

export function resolveProjectMemoryRoot(input) {
  const platform = input.platform ?? process.platform;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const workspaceIdentity = input.workspaceIdentity?.trim();
  const workspacePath = paths.resolve(input.workspacePath);
  const key = workspaceIdentity || (platform === 'win32' ? workspacePath.toLowerCase() : workspacePath);
  const slug = workspaceIdentity ? 'project' : (paths.basename(workspacePath).toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 48) || 'project');
  const storageRoot = input.cliStorageRoot ?? input.storageRoot;
  if (typeof storageRoot !== 'string' || !storageRoot) throw failure('INVALID_PATH', 'A storage root is required');
  return paths.join(storageRoot, 'memories', 'projects', `${slug}-${hash(key).slice(0, 16)}`, 'memory');
}

export function sanitizePersistentAgentMemoryKey(agentName) {
  // Source intentionally replaces UTF-16 code units: an astral character yields two '-'.
  return agentName.replace(/[^a-zA-Z0-9_-]/g, '-') || 'unknown';
}
export function resolvePersistentAgentMemoryRoot(input) {
  if (!['user', 'project', 'local'].includes(input.scope)) throw failure('INVALID_SCOPE', 'Memory scope must be user, project or local');
  const paths = pathFlavor(input.storageRoot, input.workspaceRoot);
  const key = sanitizePersistentAgentMemoryKey(input.agentName);
  if (input.scope === 'user') return paths.join(input.storageRoot, 'agent-memory', key);
  // MODIFIED: never access the real ZCode profile or .zcode project directory.
  return paths.join(paths.resolve(input.workspaceRoot), '.dsh', input.scope === 'project' ? 'agent-memory' : 'agent-memory-local', key);
}
export function memoryFileRelativePath(rootDir, filePath) {
  const paths = pathFlavor(rootDir, filePath);
  const relative = paths.relative(rootDir, filePath);
  return relative && relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative) ? relative : undefined;
}
export function containsSensitiveMemoryPathSegment(relativePath) {
  return relativePath.split(/[\\/]+/u).some(segment => SENSITIVE_SEGMENTS.has(segment.toLowerCase()
    .replace(/[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/gu, '').split(':', 1)[0].replace(/[. ]+$/u, '')));
}
export function resolveContainedMemoryFilePath({ filePath, rootDir, workingDirectory, workspaceRoot }) {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) return undefined;
  const paths = pathFlavor(rootDir, filePath);
  const target = paths.resolve(workingDirectory ?? workspaceRoot ?? rootDir, filePath);
  return memoryFileRelativePath(rootDir, target) ? target : undefined;
}
function validRelative(relative) {
  if (!relative || relative.includes('\0') || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)) return false;
  const parts = relative.split(/[\\/]/u);
  return parts.every(part => part && part !== '.' && part !== '..' && !/[<>:"|?*\u0000-\u001f\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/u.test(part)
    && !/[. ]$/u.test(part) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))
    && !containsSensitiveMemoryPathSegment(relative);
}
function validMemoryRelative(relative) {
  if (!validRelative(relative)) return false;
  const filename = relative.split(/[\\/]/u).at(-1);
  // Source requires a lowercase extension, not a lowercase basename. Exact-case
  // filesystem validation below still rejects aliases such as title.md -> Title.md.
  return filename.endsWith('.md');
}
export function resolveSafeMemoryFilePath(input) {
  if (typeof input.filePath !== 'string' || input.filePath.split(/[\\/]/u).includes('..')) return undefined;
  const target = resolveContainedMemoryFilePath(input);
  return target && validMemoryRelative(memoryFileRelativePath(input.rootDir, target)) ? target : undefined;
}

export function formatProjectMemoryIndexContent(content) {
  const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?---\s*\n?/u, '');
  let result = withoutFrontmatter;
  if (result.includes('<!--')) {
    result = '';
    for (const token of new Lexer({ gfm: false }).lex(withoutFrontmatter)) {
      if (token.type === 'html' && token.raw.trimStart().startsWith('<!--') && token.raw.includes('-->')) {
        const stripped = token.raw.replace(/<!--[\s\S]*?-->/gu, '');
        if (stripped.trim()) result += stripped;
      } else result += token.raw;
    }
  }
  return formatMemoryIndexContent(result);
}
export function formatMemoryIndexContent(content) {
  const trimmed = content.trim();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');
  const lineTruncated = lines.length > MEMORY_INDEX_LINE_LIMIT;
  const characterTruncated = trimmed.length > MEMORY_INDEX_CHARACTER_LIMIT;
  if (!lineTruncated && !characterTruncated) return trimmed;
  let truncated = lineTruncated ? lines.slice(0, MEMORY_INDEX_LINE_LIMIT).join('\n') : trimmed;
  if (truncated.length > MEMORY_INDEX_CHARACTER_LIMIT) {
    const finalNewline = truncated.lastIndexOf('\n', MEMORY_INDEX_CHARACTER_LIMIT);
    truncated = truncated.slice(0, finalNewline > 0 ? finalNewline : MEMORY_INDEX_CHARACTER_LIMIT);
  }
  const description = characterTruncated && !lineTruncated
    ? `${formatBytes(trimmed.length)} (limit: ${formatBytes(MEMORY_INDEX_CHARACTER_LIMIT)}) — index entries are too long`
    : lineTruncated && !characterTruncated ? `${lines.length} lines (limit: ${MEMORY_INDEX_LINE_LIMIT})`
      : `${lines.length} lines and ${formatBytes(trimmed.length)}`;
  return `${truncated}\n\n> WARNING: MEMORY.md is ${description}. Only part of it was loaded. Keep index entries to one line under ~200 chars; move detail into topic files.`;
}
function formatBytes(value) {
  const kb = value / 1024;
  if (kb < 1) return `${value} bytes`;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\.0$/u, '')}KB`;
  const mb = kb / 1024;
  return mb < 1024 ? `${mb.toFixed(1).replace(/\.0$/u, '')}MB` : `${(mb / 1024).toFixed(1).replace(/\.0$/u, '')}GB`;
}
export function stampMemoryOriginSessionId({ content, filePath, memoryRoot, sessionId }) {
  if (!memoryRoot || !filePath.endsWith('.md') || memoryFileRelativePath(memoryRoot, filePath) === undefined) return content;
  const match = FRONTMATTER.exec(content);
  if (!match) return content;
  const document = parseDocument(match[2]);
  if (document.errors.length) return content;
  try {
    if (document.get('metadata', true) === undefined) document.set('metadata', {});
    const metadata = document.get('metadata', true);
    if (!isMap(metadata)) return content;
    const existing = metadata.get('originSessionId');
    if (typeof existing === 'string' && existing.length > 0) return content;
    metadata.delete('node_type');
    metadata.items.unshift(document.createPair('node_type', 'memory'));
    metadata.set('originSessionId', sessionId);
  } catch { return content; }
  const eol = match[1].endsWith('\r\n') ? '\r\n' : '\n';
  return `${match[1]}${document.toString().replace(/\n$/u, '').replace(/\n/gu, eol)}${match[3]}${content.slice(match[0].length)}`;
}

function ancestors(directory) {
  const absolute = path.resolve(directory);
  const root = path.parse(absolute).root;
  let current = root;
  return absolute.slice(root.length).split(path.sep).filter(Boolean).map(segment => current = path.join(current, segment));
}
async function plainDirectories(directory, allowMissing = false) {
  for (const current of ancestors(directory)) {
    let stat;
    try { stat = await lstat(current); } catch (error) { if (allowMissing && isMissing(error)) return; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('INVALID_PATH', 'Memory directory is not a plain directory');
  }
}
function plainDirectoriesSync(directory) {
  for (const current of ancestors(directory)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('INVALID_PATH', 'Memory directory is not a plain directory');
  }
}
async function ensureDirectory(directory, signal) {
  checkAbort(signal);
  await plainDirectories(directory, true);
  checkAbort(signal);
  await mkdir(directory, { recursive: true });
  await plainDirectories(directory);
  checkAbort(signal);
}
function resolveStorePath(rootDir, filePath, internal = false) {
  if (typeof filePath !== 'string' || filePath.split(/[\\/]/u).includes('..')) throw failure('INVALID_PATH', 'Invalid memory path');
  const target = path.resolve(rootDir, filePath);
  const relative = memoryFileRelativePath(rootDir, target);
  if (!(internal ? relative === DREAM_LOCK_FILE : validMemoryRelative(relative))) throw failure('INVALID_PATH', 'Only contained lowercase .md memory files are allowed');
  return target;
}
async function validatePath(rootDir, target, { allowMissing = false } = {}) {
  await plainDirectories(rootDir, allowMissing);
  const relative = memoryFileRelativePath(rootDir, target);
  if (!relative) throw failure('INVALID_PATH', 'Memory path must be inside its root');
  let current = rootDir;
  for (const part of relative.split(path.sep)) {
    let entries;
    try { entries = await readdir(current); } catch (error) { if (allowMissing && isMissing(error)) return; throw error; }
    const aliases = entries.filter(name => name.toLowerCase() === part.toLowerCase());
    if (aliases.length > 1 || aliases.length === 1 && aliases[0] !== part) throw failure('INVALID_PATH', 'Memory path casing does not match exactly');
    if (!aliases.length) {
      if (allowMissing) return;
      throw failure('FILE_NOT_FOUND', 'Memory file was not found');
    }
    current = path.join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (current !== target && !stat.isDirectory()) || (current === target && !stat.isFile())) throw failure('INVALID_PATH', 'Memory path must not contain symlinks or special files');
  }
  const rootReal = await realpath(rootDir);
  const targetReal = await realpath(target);
  if (!memoryFileRelativePath(rootReal, targetReal)) throw failure('INVALID_PATH', 'Memory file resolved outside its root');
}
function validateCommitPath(rootDir, target) {
  plainDirectoriesSync(path.dirname(target));
  const relative = memoryFileRelativePath(rootDir, target);
  if (!relative) throw failure('INVALID_PATH', 'Memory file escaped its root');
  let current = rootDir;
  for (const part of relative.split(path.sep)) {
    const aliases = readdirSync(current).filter(name => name.toLowerCase() === part.toLowerCase());
    if (aliases.length > 1 || aliases.length === 1 && aliases[0] !== part) throw failure('INVALID_PATH', 'Memory path casing does not match exactly');
    current = path.join(current, part);
    if (!aliases.length) { if (current === target) return undefined; throw failure('INVALID_PATH', 'Memory parent disappeared'); }
    const stat = lstatSync(current, { bigint: true });
    if (stat.isSymbolicLink() || current !== target && !stat.isDirectory() || current === target && !stat.isFile()) throw failure('INVALID_PATH', 'Memory path changed to a link or special file');
    if (current === target) return stat;
  }
}
function snapshotKey(stat) { return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':'); }
function sameSnapshot(a, b) { return Boolean(a && b && snapshotKey(a) === snapshotKey(b)); }

/** Read from a verified handle, bounded before allocation and after concurrent growth. */
export async function readMemoryFileFromStableHandle({ rootDir, filePath, signal, maxBytes = MEMORY_FILE_MAX_BYTES }) {
  checkAbort(signal);
  let handle;
  try {
    await validatePath(rootDir, filePath);
    const before = await lstat(filePath, { bigint: true });
    checkAbort(signal);
    handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat({ bigint: true });
    await validatePath(rootDir, filePath);
    const after = await lstat(filePath, { bigint: true });
    if (!opened.isFile() || !sameSnapshot(before, opened) || !sameSnapshot(opened, after)) throw failure('FILE_CHANGED', 'Memory file changed during read');
    if (opened.size > BigInt(maxBytes)) throw failure('FILE_TOO_LARGE', 'Memory file exceeds the 5 MiB limit');
    const buffer = Buffer.alloc(Math.min(Number(opened.size) + 1, maxBytes + 1));
    let length = 0;
    while (length < buffer.length) {
      checkAbort(signal);
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const final = await handle.stat({ bigint: true });
    await validatePath(rootDir, filePath);
    const finalPath = await lstat(filePath, { bigint: true });
    if (!sameSnapshot(opened, final) || !sameSnapshot(final, finalPath)) throw failure('FILE_CHANGED', 'Memory file changed during read');
    if (length > maxBytes || final.size > BigInt(maxBytes)) throw failure('FILE_TOO_LARGE', 'Memory file exceeds the 5 MiB limit');
    checkAbort(signal);
    const bytes = buffer.subarray(0, length);
    const revisionId = hash(`${snapshotKey(final)}:${hash(bytes)}`);
    return { content: bytes.toString('utf8'), path: filePath, filePath, updatedAt: Number(final.mtimeNs) / 1e6, mtimeMs: Number(final.mtimeNs) / 1e6, sizeBytes: Number(final.size), revisionId, revision: { id: revisionId }, snapshot: snapshotKey(final) };
  } catch (error) {
    if (isMissing(error)) throw failure('FILE_NOT_FOUND', 'Memory file was not found', error);
    if (error?.code === 'ELOOP') throw failure('INVALID_PATH', 'Memory symlink was refused', error);
    throw error;
  } finally { await handle?.close(); }
}

export function createReadState(seed) {
  if (seed === undefined) return new Map();
  if (!(seed instanceof Map)) throw new TypeError('readState must be a Map');
  return new Map([...seed].map(([key, value]) => [key, structuredClone(value)]));
}
function stateKey(filePath) { return process.platform === 'win32' ? path.resolve(filePath).toLowerCase() : path.resolve(filePath); }
function rememberRead(state, result, offset, limit) {
  if (!state) return;
  if (!(state instanceof Map)) throw new TypeError('readState must be a Map');
  state.set(stateKey(result.path), { ...result, readAt: new Date(), offset, limit });
}
function requireRead(state, current) {
  const prior = state?.get(stateKey(current.path));
  if (!prior) throw failure('READ_REQUIRED', 'Read the memory file before changing it');
  if (prior.isPartialView) throw failure('READ_REQUIRED', 'Read the memory file again before changing a cleaned or truncated view');
  if ((prior.revisionId ?? prior.revision?.id) !== current.revisionId) throw failure('FILE_CHANGED', 'Memory file changed since the last Read; read it again');
  return prior;
}
async function serialized(key, action) {
  const previous = mutationQueues.get(key) ?? Promise.resolve();
  const running = previous.catch(() => {}).then(action);
  mutationQueues.set(key, running);
  try { return await running; } finally { if (mutationQueues.get(key) === running) mutationQueues.delete(key); }
}
async function optionalRead(rootDir, target, signal) {
  try { return await readMemoryFileFromStableHandle({ rootDir, filePath: target, signal }); }
  catch (error) { if (isMissing(error)) return undefined; throw error; }
}
async function atomicCommit(rootDir, target, content, expected, signal) {
  checkAbort(signal);
  if (Buffer.byteLength(content, 'utf8') > MEMORY_FILE_MAX_BYTES) throw failure('FILE_TOO_LARGE', 'Memory file exceeds the 5 MiB limit');
  await validatePath(rootDir, target, { allowMissing: true });
  await ensureDirectory(path.dirname(target), signal);
  const temporary = path.join(path.dirname(target), `.memory-tmp-${randomUUID()}`);
  let tempHandle;
  try {
    tempHandle = await open(temporary, 'wx', 0o600);
    await tempHandle.writeFile(content, { encoding: 'utf8', signal });
    await tempHandle.sync();
    await tempHandle.close(); tempHandle = undefined;
    // A tiny synchronous commit seam prevents an abort callback running between
    // the final liveness check and rename. All potentially large IO is async.
    checkAbort(signal);
    const current = validateCommitPath(rootDir, target);
    if (expected ? !current || snapshotKey(current) !== expected.snapshot : current) throw failure('FILE_CHANGED', 'Memory file changed before commit');
    checkAbort(signal);
    renameSync(temporary, target);
  } finally {
    await tempHandle?.close();
    // The path is an exact generated sibling, not a model-controlled rm target.
    try { await unlink(temporary); } catch (error) { if (!isMissing(error)) throw error; }
  }
}

/** Root is immutable; pass a freshly cloned readState to each background run. */
export function createMemoryStorage(input) {
  const rootDir = path.resolve(input.rootDir ?? resolveProjectMemoryRoot(input));
  let indexPromise;
  const unified = new unifiedCore.MemoryStore({root:rootDir,host:'dsh',project:input.workspaceIdentity??input.workspacePath??rootDir,scope:input.scope??(input.rootDir?'agent':'project'),agent:input.agentName,readOnly:input.readOnly});
  const store = {
    unified,
    rootDir,
    memoryRoot: rootDir,
    createReadState,
    ensure: ({ signal } = {}) => input.readOnly ? Promise.resolve() : ensureDirectory(rootDir, signal),
    resolve(filePath) { return resolveStorePath(rootDir, filePath); },
    async read(filePath, options = {}) {
      const target = resolveStorePath(rootDir, filePath);
      const { offset, limit, signal, readState } = options;
      if (offset !== undefined && (!Number.isInteger(offset) || offset < 1) || limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw failure('INVALID_RANGE', 'Read offset/limit must be positive integers');
      const result = await readMemoryFileFromStableHandle({ rootDir, filePath: target, signal });
      const lines = result.content.split('\n');
      const start = (offset ?? 1) - 1;
      const isRangeView = start > 0 || limit !== undefined && limit < lines.length;
      // Source Read uses isPartialView only for transformed/token-truncated output;
      // explicit offset/limit ranges retain normal read-before-mutation authority.
      const viewed = { ...result, content: offset !== undefined || limit !== undefined ? lines.slice(start, limit === undefined ? undefined : start + limit).join('\n') : result.content, totalLines: lines.length, isRangeView, isPartialView: false };
      rememberRead(readState, viewed, offset, limit);
      return viewed;
    },
    loadIndexOnce(options = {}) {
      if (!indexPromise) indexPromise = (async () => {
        const readState = createReadState();
        const filePath = path.join(rootDir, 'MEMORY.md');
        let raw = ''; let indexError;
        try { raw = (await store.read(filePath, { ...options, readState })).content; }
        catch (error) {
          checkAbort(options.signal);
          if (error?.name === 'AbortError') throw error;
          if (!isMissing(error)) indexError = error;
          readState.clear();
        }
        const content = formatProjectMemoryIndexContent(raw);
        if (!content) readState.clear();
        // Source distinguishes the raw observation from what reached the model.
        // A cleaned/truncated index is not a complete view; keep raw bytes for
        // freshness but require a real Read before mutation of this index.
        if (raw !== content) for (const entry of readState.values()) entry.isPartialView = true;
        return { raw, rawContent: raw, content, indexPath: filePath, filePath, readState, ...(indexError ? { indexError } : {}) };
      })();
      return indexPromise;
    },
    write(filePath, content, options = {}) {
      const target = resolveStorePath(rootDir, filePath);
      if (typeof content !== 'string') throw new TypeError('Memory content must be a string');
      return serialized(stateKey(target), async () => {
        checkAbort(options.signal);
        const current = await optionalRead(rootDir, target, options.signal);
        if (current) requireRead(options.readState, current);
        const sessionId = options.sessionId ?? input.sessionId;
        const stamped = sessionId ? stampMemoryOriginSessionId({ content, filePath: target, memoryRoot: rootDir, sessionId }) : content;
        await unified.writeRaw(target, stamped, {signal:options.signal,session:sessionId,origin:options.origin??'manual',expectedRevision:current?unifiedCore.hash(current.content):null});
        const result = await store.read(target, { readState: options.readState });
        return { ...result, before: current?.content ?? null, after: stamped, operation: current ? 'update' : 'create', changed: !current || current.content !== stamped };
      });
    },
    edit(filePath, oldString, newString, options = {}) {
      const target = resolveStorePath(rootDir, filePath);
      if (typeof oldString !== 'string' || !oldString || typeof newString !== 'string') throw failure('INVALID_EDIT', 'Edit requires a nonempty literal old string and a replacement string');
      return serialized(stateKey(target), async () => {
        checkAbort(options.signal);
        const current = await readMemoryFileFromStableHandle({ rootDir, filePath: target, signal: options.signal });
        requireRead(options.readState, current);
        const occurrences = current.content.split(oldString).length - 1;
        if (!occurrences || !options.replaceAll && occurrences !== 1) throw failure('EDIT_MATCH', 'Edit text must match exactly once unless replaceAll is true');
        let content = options.replaceAll ? current.content.split(oldString).join(newString) : current.content.replace(oldString, () => newString);
        const sessionId = options.sessionId ?? input.sessionId;
        if (sessionId) content = stampMemoryOriginSessionId({ content, filePath: target, memoryRoot: rootDir, sessionId });
        await unified.writeRaw(target, content, {signal:options.signal,session:sessionId,origin:options.origin??'manual',expectedRevision:unifiedCore.hash(current.content)});
        return { ...await store.read(target, { readState: options.readState }), before: current.content, after: content, operation: 'update', changed: content !== current.content };
      });
    },
    remove(filePath, options = {}) {
      const target = resolveStorePath(rootDir, filePath);
      return serialized(stateKey(target), async () => {
        const current = await readMemoryFileFromStableHandle({ rootDir, filePath: target, signal: options.signal });
        const final = validateCommitPath(rootDir, target);
        if (!final || snapshotKey(final) !== current.snapshot) throw failure('FILE_CHANGED', 'Memory changed before removal');
        checkAbort(options.signal);
        await unified.forget(target, {signal:options.signal,session:options.sessionId??input.sessionId,origin:options.origin??'manual',expectedRevision:unifiedCore.hash(current.content)});
        options.readState?.delete(stateKey(target));
        return { path: target, removed: true };
      });
    },
    async list(options = {}) { return listMemoryFiles(rootDir, options); },
    async manifest(options = {}) { return scanMemoryManifest({ rootDir, ...options }); },
    async readRecalledMemories(options) { return readRecalledMemories({ ...options, storage: store }); },
    readDreamLastConsolidatedAt: () => readDreamLastConsolidatedAt(rootDir),
    acquireDreamLock: (options = {}) => acquireDreamLock({ ...options, memoryRoot: rootDir }),
    restoreDreamLockAfterFailure: options => restoreDreamLockAfterFailure({ ...options, memoryRoot: rootDir }),
    releaseDreamLock: (options = {}) => releaseDreamLock({ ...options, memoryRoot: rootDir }),
  };
  return Object.freeze(store);
}

async function listMemoryFiles(rootDir, { query = '', signal, recursive = true } = {}) {
  checkAbort(signal);
  try { await plainDirectories(rootDir); } catch (error) { if (isMissing(error)) return []; throw error; }
  const results = [];
  async function visit(directory) {
    checkAbort(signal);
    await plainDirectories(directory);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      checkAbort(signal);
      if (entry.isSymbolicLink()) continue;
      const filePath = path.join(directory, entry.name);
      const relative = memoryFileRelativePath(rootDir, filePath);
      if (!validRelative(relative)) continue;
      if (entries.filter(other => other.name.toLowerCase() === entry.name.toLowerCase()).length > 1) continue;
      if (entry.isDirectory()) { if (recursive) await visit(filePath); continue; }
      if (!entry.isFile() || !validMemoryRelative(relative) || !relative.toLowerCase().includes(query.toLowerCase())) continue;
      try {
        await validatePath(rootDir, filePath);
        const stat = await lstat(filePath);
        results.push({ name: relative.split(path.sep).join('/'), filename: relative.split(path.sep).join('/'), filePath, kind: entry.name === 'MEMORY.md' ? 'index' : 'item', size: stat.size, sizeBytes: stat.size, updatedAt: stat.mtimeMs, mtimeMs: stat.mtimeMs });
      } catch (error) { if (!isMissing(error) && error.code !== 'INVALID_PATH') throw error; }
    }
  }
  await visit(rootDir);
  return results.sort((a, b) => a.kind !== b.kind ? a.kind === 'index' ? -1 : 1 : a.name.localeCompare(b.name, 'en'));
}
function parseMemoryFrontmatter(content) {
  const lines = content.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n').split('\n');
  if (lines[0] !== '---') return {};
  const end = lines.indexOf('---', 1);
  if (end < 0) return {};
  let parsed;
  try { parsed = parseYaml(lines.slice(1, end).join('\n')); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const type = parsed.metadata?.type ?? parsed.type;
  return { ...(typeof parsed.description === 'string' && parsed.description ? { description: parsed.description } : {}), ...(MEMORY_RECALL_TYPES.includes(type) ? { type } : {}) };
}
export async function scanMemoryManifest({ rootDir, signal }) {
  try {
    const files = (await listMemoryFiles(rootDir, { signal })).filter(entry => entry.kind !== 'index');
    const entries = await Promise.allSettled(files.map(async entry => {
      const result = await readMemoryFileFromStableHandle({ rootDir, filePath: entry.filePath, signal });
      return { filePath: entry.filePath, filename: entry.filename, mtimeMs: result.mtimeMs,
        ...parseMemoryFrontmatter(result.content.split('\n').slice(0, MANIFEST_PREVIEW_LINE_LIMIT).join('\n')) };
    }));
    checkAbort(signal);
    return entries.filter(entry => entry.status === 'fulfilled').map(entry => entry.value).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MANIFEST_FILE_LIMIT);
  } catch (error) {
    // Upstream treats unavailable/unsafe manifests as empty. Cancellation is not
    // an empty successful scan: preserve abort so late work cannot alter state.
    checkAbort(signal);
    if (error?.name === 'AbortError') throw error;
    return [];
  }
}
export async function readRecalledMemories({ entries, storage, rootDir, nowMs = Date.now(), signal }) {
  const store = storage ?? createMemoryStorage({ rootDir });
  const results = await Promise.allSettled(entries.map(async entry => {
    const result = await store.read(entry.filePath, { limit: MEMORY_CONTENT_LINE_LIMIT, signal });
    const lines = result.content.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n').split('\n');
    const selected = []; let bytes = 0; let byteTruncated = false;
    for (const line of lines) {
      const next = bytes + (selected.length ? 1 : 0) + Buffer.byteLength(line, 'utf8');
      if (next > MEMORY_CONTENT_BYTE_LIMIT) { byteTruncated = true; break; }
      selected.push(line); bytes = next;
    }
    const truncated = byteTruncated || result.totalLines > MEMORY_CONTENT_LINE_LIMIT;
    let content = selected.join('\n');
    if (truncated) content += `\n\n> This memory file was truncated (${byteTruncated ? `${MEMORY_CONTENT_BYTE_LIMIT} byte limit` : `first ${MEMORY_CONTENT_LINE_LIMIT} lines`}). Use the Read tool to view the complete file at: ${entry.filePath}`;
    const days = Math.max(0, Math.floor((nowMs - entry.mtimeMs) / 86_400_000));
    const prefix = days > 1 ? `This memory is ${days} days old. Memories are point-in-time observations, not live state — claims about code behavior or file:line citations may be outdated. Verify against current code before asserting as fact.\n\n` : '';
    return { content, filePath: entry.filePath, header: `${prefix}Memory: ${entry.filePath}:`, limit: truncated ? selected.length : undefined, mtimeMs: entry.mtimeMs, revisionId: result.revisionId, sizeBytes: result.sizeBytes };
  }));
  checkAbort(signal);
  return results.filter(result => result.status === 'fulfilled').map(result => result.value);
}

/** Local viewer only: catalog never creates folders and remote never touches disk. */
export function createMemoryCatalog({ storageRoot, remote = false }) {
  const projectsRoot = path.resolve(storageRoot, 'memories', 'projects');
  const workspaceRoot = async id => {
    if (remote || typeof id !== 'string' || !/^[a-z0-9._-]+-[a-f0-9]{16}$/u.test(id) || !validRelative(id)) throw failure('INVALID_PATH', 'Invalid local memory workspace');
    await plainDirectories(projectsRoot);
    const aliases = (await readdir(projectsRoot)).filter(name => name.toLowerCase() === id.toLowerCase());
    if (aliases.length !== 1 || aliases[0] !== id) throw failure('INVALID_PATH', 'Workspace name does not match exactly');
    const rootDir = path.join(projectsRoot, id, 'memory');
    await plainDirectories(rootDir);
    return rootDir;
  };
  return Object.freeze({
    async listWorkspaces({ query = '', signal } = {}) {
      if (remote) return [];
      checkAbort(signal);
      try { await plainDirectories(projectsRoot); } catch (error) { if (isMissing(error)) return []; throw error; }
      const workspaces = [];
      for (const entry of await readdir(projectsRoot, { withFileTypes: true })) {
        checkAbort(signal);
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        try {
          const rootDir = await workspaceRoot(entry.name);
          const allFiles = (await listMemoryFiles(rootDir, { signal, recursive: false }))
            .filter(file => !/[\\/]/u.test(file.name));
          if (!allFiles.length) continue;
          const files = allFiles.filter(file => file.name.toLowerCase().includes(query.toLowerCase()))
            .map(({ name, kind, size, updatedAt }) => ({ name, kind, size, updatedAt }));
          if (query && !files.length) continue;
          workspaces.push({ id: entry.name, label: entry.name.replace(/-[a-f0-9]{16}$/u, ''), updatedAt: Math.max(0, ...allFiles.map(file => file.updatedAt)), files });
        } catch (error) { if (!isMissing(error) && error.code !== 'INVALID_PATH') throw error; }
      }
      return workspaces.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    },
    async readFile(workspaceId, fileName, { signal } = {}) {
      checkAbort(signal);
      try {
        if (typeof fileName !== 'string' || /[\\/]/u.test(fileName) || !validMemoryRelative(fileName)) throw failure('INVALID_PATH', 'Catalog accepts only a top-level memory filename');
        const rootDir = await workspaceRoot(workspaceId);
        const target = resolveStorePath(rootDir, fileName);
        const { content, updatedAt } = await readMemoryFileFromStableHandle({ rootDir, filePath: target, signal });
        return { content, updatedAt };
      } catch (error) { if (isMissing(error)) throw failure('FILE_NOT_FOUND', 'Memory file was not found', error); throw error; }
    },
  });
}

async function readLock(memoryRoot) {
  const target = resolveStorePath(memoryRoot, DREAM_LOCK_FILE, true);
  return optionalRead(memoryRoot, target);
}
export async function readDreamLastConsolidatedAt(memoryRoot) {
  return (await readLock(memoryRoot))?.mtimeMs ?? 0;
}
export async function acquireDreamLock({ memoryRoot, nowMs = Date.now(), pid = process.pid, signal, isProcessAlive = isLiveProcess }) {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw failure('INVALID_PID', 'Dream requires a valid process id');
  const rootDir = path.resolve(memoryRoot);
  const target = resolveStorePath(rootDir, DREAM_LOCK_FILE, true);
  return serialized(stateKey(target), async () => {
    checkAbort(signal);
    const prior = await readLock(rootDir);
    const priorPid = Number.parseInt(prior?.content.trim(), 10);
    if (prior && nowMs - prior.mtimeMs < DREAM_LOCK_FRESH_MS && Number.isFinite(priorPid) && isProcessAlive(priorPid)) return null;
    await atomicCommit(rootDir, target, String(pid), prior, signal);
    const written = await readLock(rootDir);
    return Number.parseInt(written?.content.trim(), 10) === pid ? prior?.mtimeMs ?? 0 : null;
  });
}
function isLiveProcess(pid) {
  if (pid <= 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
export async function restoreDreamLockAfterFailure({ memoryRoot, priorMtimeMs, signal }) {
  const rootDir = path.resolve(memoryRoot);
  const target = resolveStorePath(rootDir, DREAM_LOCK_FILE, true);
  return serialized(stateKey(target), async () => {
    const current = await readLock(rootDir);
    if (!current) return;
    checkAbort(signal);
    if (priorMtimeMs === 0) {
      const final = validateCommitPath(rootDir, target);
      if (!final || snapshotKey(final) !== current.snapshot) throw failure('FILE_CHANGED', 'Dream lock changed before recovery');
      checkAbort(signal); await unlink(target); return;
    }
    await atomicCommit(rootDir, target, '', current, signal);
    checkAbort(signal);
    await utimes(target, priorMtimeMs / 1000, priorMtimeMs / 1000);
  });
}
export async function releaseDreamLock({ memoryRoot, nowMs = Date.now(), signal }) {
  const rootDir = path.resolve(memoryRoot);
  const target = resolveStorePath(rootDir, DREAM_LOCK_FILE, true);
  return serialized(stateKey(target), async () => {
    const current = await readLock(rootDir);
    if (!current) return;
    await atomicCommit(rootDir, target, '', current, signal);
    checkAbort(signal);
    await utimes(target, nowMs / 1000, nowMs / 1000);
  });
}

/** Explicit custom-agent opt-in; ordinary subagents get no store by default. */
export async function loadPersistentAgentMemory({ profile, memory, workspaceRoot, signal }) {
  if (!profile?.memory || memory?.enabled !== true || memory.use === false || !memory.storageRoot) return undefined;
  const rootDir = resolvePersistentAgentMemoryRoot({ agentName: profile.name, scope: profile.memory, storageRoot: memory.storageRoot, workspaceRoot });
  const storage = createMemoryStorage({ rootDir, sessionId: memory.sessionId });
  await storage.ensure({ signal });
  const index = await storage.loadIndexOnce({ signal });
  const { buildPersistentAgentMemoryPrompt } = await import('./prompts.js');
  return { rootDir, storage, readState: index.readState, prompt: buildPersistentAgentMemoryPrompt({ indexContent: index.rawContent, rootDir, scope: profile.memory }) };
}
export function projectPersistentAgentMemoryTools(definitions, memory) {
  if (memory?.enabled !== true || memory.use === false || !memory.storageRoot) return definitions;
  const activeAgents = definitions.activeAgents.map(profile => {
    if (!profile.memory || profile.tools === undefined) return profile;
    const tools = [...new Set([...profile.tools, 'Write', 'Edit'])];
    return tools.length === profile.tools.length ? profile : { ...profile, tools };
  });
  return activeAgents.every((profile, index) => profile === definitions.activeAgents[index]) ? definitions : { ...definitions, activeAgents };
}
export const createReadFileState = createReadState;
export const isContainedMemoryPath = (rootDir, filePath) => memoryFileRelativePath(rootDir, filePath) !== undefined;
export const readProjectMemoryFileFromStableHandle = readMemoryFileFromStableHandle;
export const formatMemoryManifest = manifest => manifest.map(entry => `- ${entry.type ? `[${entry.type}] ` : ''}${entry.filename} (${new Date(entry.mtimeMs).toISOString()})${entry.description ? `: ${entry.description}` : ''}`).join('\n');
export const buildMemoryManifest = scanMemoryManifest;
export const readMemoryManifest = scanMemoryManifest;
export const createProjectMemoryStore = createMemoryStorage;
export const createProjectMemoryCatalog = createMemoryCatalog;
export { failure as createMemoryError };

// There is intentionally no default profile path, background timer or remote IO.

