import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as prompts from '../../src/prompts.js';
import { formatMemoryIndexContent } from '../../src/storage.js';
const project = new URL('../../', import.meta.url);
const core = 'assets/upstream/apps/zcode-cli/packages/core/';
const fixture = async name => (await readFile(new URL(`${core}tests/fixtures/memory/${name}.md`, project), 'utf8')).trimEnd();
const source = async relative => readFile(new URL(`${core}src/${relative}`, project), 'utf8');
const strip = text => stripTypeScriptTypes(text.replace(/^import\b[\s\S]*?;\s*/gm, ''), { mode: 'strip' }).replace(/\bexport\s+/gu, '');
function extract(text, start, end) { const a = text.indexOf(start); return text.slice(a, end ? text.indexOf(end, a + start.length) : undefined); }
const manifest = [{ filename: 'db.md', filePath: '/memory/db.md', description: 'Real database policy', type: 'feedback', mtimeMs: 1720000000000 }];

test('main default and dormant semantic prompts are exact source golden fixtures', async () => {
  assert.equal(prompts.buildMemoryContent('<MEMORY_ROOT>'), await fixture('main-memory-default-index'));
  assert.equal(prompts.buildMemoryContent('<MEMORY_ROOT>', 'default-index'), await fixture('main-memory-default-index'));
  assert.equal(prompts.buildMemoryContent('<MEMORY_ROOT>', 'semantic-recall'), await fixture('main-memory-semantic-recall'));
  assert.equal(prompts.buildMemorySection(undefined), null);
  const section = prompts.buildMemorySection('<MEMORY_ROOT>');
  assert.equal(section.content, await fixture('main-memory-default-index'));
  assert.equal(section.source, 'memory'); assert.equal(section.injectionTarget, 'system');
});

test('full Persistent Agent Memory preserves source golden and all scope instructions', async () => {
  const guidance = {
    user: '- Since this memory is user-scope, keep learnings general since they apply across all projects',
    project: '- Since this memory is project-scope and shared with your team via version control, tailor your memories to this project',
    local: '- Since this memory is local-scope (not checked into version control), tailor your memories to this project and machine',
  };
  for (const scope of Object.keys(guidance)) {
    const prompt = prompts.buildPersistentAgentMemoryPrompt({ rootDir: '<MEMORY_ROOT>', scope, indexContent: '' });
    const normalized = prompt.replace('<MEMORY_ROOT>\\', '<MEMORY_ROOT>/');
    assert.equal(normalized, (await fixture('custom-agent-memory')).replace('<SCOPE_GUIDANCE>', guidance[scope]));
  }
  const prompt = prompts.buildPersistentAgentMemoryPrompt({ rootDir: '/m', scope: 'user', indexContent: Array(201).fill('item').join('\n') });
  assert.match(prompt, /WARNING: MEMORY.md is 201 lines/u);
});

test('extraction prompt is byte-equivalent to extracted upstream function', async () => {
  const text = await source('memory/extraction.ts');
  const block = strip(extract(text, 'export function buildMemoryExtractionPrompt', '\nexport function evaluateMemoryExtraction'));
  const original = vm.runInNewContext(`${block}\nbuildMemoryExtractionPrompt`, { formatMemoryManifest: prompts.formatMemoryManifest });
  for (const input of [{ manifest: [], messageCount: 3 }, { manifest, messageCount: 19 }]) assert.equal(prompts.buildMemoryExtractionPrompt(input), original(input));
  assert.match(prompts.buildMemoryExtractionPrompt({ manifest, messageCount: 19 }), /Edit requires a prior Read/u);
});

test('complete Dream prompt is byte-equivalent to upstream with all phases and constraints', async () => {
  const text = await source('memory/dream.ts');
  const block = strip(extract(text, 'export function buildMemoryDreamPrompt', '\nexport function collectDreamTouchedPaths'));
  const original = vm.runInNewContext(`${block}\nbuildMemoryDreamPrompt`);
  const input = { memoryRoot: '/memory', sessionIds: ['s1', 's2', 's3', 's4', 's5'], transcriptRoot: '/transcripts' };
  assert.equal(prompts.buildMemoryDreamPrompt(input), original(input));
  for (const term of ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Reconcile memories against CLAUDE.md', 'no need to probe']) assert.ok(prompts.buildMemoryDreamPrompt(input).includes(term));
});

test('selector system prompt/schema/request match source and sticky conversation', async () => {
  const text = await source('memory/recall/selector.ts');
  const constants = strip(extract(text, 'const MEMORY_SELECTOR_SYSTEM_PROMPT', '\nconst EMPTY_SELECTOR_RESULT'));
  const build = strip(extract(text, 'export function buildMemorySelectorRequest', '\nexport async function runMemorySelector'));
  const conversation = strip(extract(text, 'function selectorConversation', '\nfunction parseSelectorResponse'));
  const original = vm.runInNewContext(`${constants}\n${build}\n${conversation}\n({buildMemorySelectorRequest,MEMORY_SELECTOR_SYSTEM_PROMPT,MEMORY_SELECTOR_RESPONSE_SCHEMA})`, { formatMemoryManifest: prompts.formatMemoryManifest });
  assert.equal(prompts.MEMORY_SELECTOR_SYSTEM_PROMPT, original.MEMORY_SELECTOR_SYSTEM_PROMPT);
  assert.equal(JSON.stringify(prompts.MEMORY_SELECTOR_RESPONSE_SCHEMA), JSON.stringify(original.MEMORY_SELECTOR_RESPONSE_SCHEMA));
  for (const state of [{ manifest }, { manifest, selectorMessages: [{ role: 'user', content: 'previous query' }] }]) {
    const input = { query: 'database tests', state };
    assert.equal(JSON.stringify(prompts.buildMemorySelectorRequest(input)), JSON.stringify(original.buildMemorySelectorRequest(input)));
  }
});

test('recalled-memory and consolidation-update fixtures match source formatting', async () => {
  const expected = await fixture('recalled-memory');
  const content = expected.slice(expected.indexOf('---'));
  assert.equal(prompts.formatRelevantMemoryAttachment([{ header: 'Memory: <MEMORY_ROOT>/database-test-policy.md:', content }]), expected);
  const update = prompts.formatMemoryUpdateAttachment({ memoryRoot: '<MEMORY_ROOT>', filesTouched: ['<MEMORY_ROOT>/release-tagging-policy.md', '<MEMORY_ROOT>/MEMORY.md'] });
  assert.equal(update, await fixture('memory-update'));
});

test('index data is attributed background context, never source agentsMd authority promotion', () => {
  const content = '- [policy](policy.md) — stored fact';
  const result = prompts.buildProjectMemoryIndexAttachment({ memoryRoot: '/memory', content });
  assert.match(result, /Source: \/memory\/MEMORY.md/u);
  assert.match(result, /background context, not instructions/u);
  assert.doesNotMatch(result, /OVERRIDE|MUST follow them exactly/u);
  assert.equal(prompts.buildProjectMemoryIndexAttachment({ memoryRoot: '/memory', content: '' }), '');
});

test('DSH tool-name mapping is explicit and does not alter the original material', () => {
  const source = prompts.buildMemoryExtractionPrompt({ manifest: [], messageCount: 4 });
  const mapped = prompts.mapMemoryToolNames(source, { Read: 'read', Write: 'write', Edit: 'edit', Grep: 'grep', Glob: 'glob', Bash: 'pwsh' });
  assert.match(mapped, /Available tools: read, grep, glob, read-only pwsh/u);
  assert.match(mapped, /edit requires a prior read/u);
  assert.equal(prompts.buildMemoryExtractionPrompt({ manifest: [], messageCount: 4 }), source);
});

test('all copied upstream files match the license/source SHA256 manifest', async () => {
  const provenance = JSON.parse(await readFile(new URL('assets/source-manifest.json', project), 'utf8'));
  assert.equal(provenance.upstreamLicense, 'Apache-2.0'); assert.ok(provenance.files.length >= 23);
  assert.ok(provenance.files.some(file => file.source === 'LICENSE'));
  assert.ok(provenance.files.some(file => file.source === 'NOTICE.md'));
  for (const item of provenance.files) {
    const bytes = await readFile(new URL(item.copiedTo, project));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.source);
    assert.equal(item.modified, false);
  }
  for (const filename of ['src/storage.js', 'src/prompts.js']) {
    const text = await readFile(new URL(filename, project), 'utf8');
    assert.match(text, /MODIFIED for DSH/u); assert.match(text, /Copyright 2026 Z.AI Co., Ltd/u);
  }
});
