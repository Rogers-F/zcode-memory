// SPDX-License-Identifier: Apache-2.0
// DSH adaptation: read-only Markdown renderer. Raw HTML, links and images never
// create active content or network requests; React escapes every source string.
import { createElement as h } from 'react';
import { marked } from 'marked';

function inline(tokens = []) {
  return tokens.map((token, key) => {
    const children = () => inline(token.tokens ?? [{ type: 'text', text: token.text ?? token.raw ?? '' }]);
    switch (token.type) {
      case 'strong': return h('strong', { key }, children());
      case 'em': return h('em', { key }, children());
      case 'del': return h('del', { key }, children());
      case 'codespan': return h('code', { key }, token.text);
      case 'br': return h('br', { key });
      case 'link': return h('span', { key, className: 'zmem-link', title: token.href }, children(), ` (${token.href})`);
      case 'image': return h('span', { key, className: 'zmem-muted' }, `[图片未加载：${token.text || token.href}]`);
      case 'html': return h('code', { key }, token.raw ?? token.text);
      case 'escape': return h('span', { key }, token.text);
      case 'text': return h('span', { key }, token.tokens ? inline(token.tokens) : token.text);
      default: return h('span', { key }, token.raw ?? token.text ?? '');
    }
  });
}

function blocks(tokens) {
  return tokens.map((token, key) => {
    switch (token.type) {
      case 'space': return null;
      case 'heading': return h(`h${Math.max(1, Math.min(6, token.depth))}`, { key }, inline(token.tokens));
      case 'paragraph': case 'text': return h('p', { key }, inline(token.tokens ?? [{ type: 'text', text: token.text }]));
      case 'code': return h('pre', { key }, h('code', null, token.text));
      case 'html': return h('pre', { key, className: 'zmem-raw-html' }, token.raw ?? token.text);
      case 'hr': return h('hr', { key });
      case 'blockquote': return h('blockquote', { key }, blocks(token.tokens));
      case 'list': return h(token.ordered ? 'ol' : 'ul', { key, ...(token.ordered ? { start: token.start } : {}) },
        token.items.map((item, index) => h('li', { key: index }, item.task ? h('input', { type: 'checkbox', checked: item.checked, disabled: true, readOnly: true, 'aria-label': item.checked ? '已完成' : '未完成' }) : null, blocks(item.tokens))));
      case 'table': return h('div', { key, className: 'zmem-table' }, h('table', null,
        h('thead', null, h('tr', null, token.header.map((cell, index) => h('th', { key: index }, inline(cell.tokens))))),
        h('tbody', null, token.rows.map((row, index) => h('tr', { key: index }, row.map((cell, cellIndex) => h('td', { key: cellIndex }, inline(cell.tokens))))))));
      default: return h('pre', { key }, token.raw ?? token.text ?? '');
    }
  });
}

export function MarkdownPreview({ content }) {
  // Retain and show metadata without letting YAML delimiters become headings.
  const frontmatter = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(content)?.[0] ?? '';
  const body = content.slice(frontmatter.length);
  let rendered;
  try { rendered = blocks(marked.lexer(body, { gfm: true })); }
  catch { rendered = h('pre', null, body); }
  return h('article', { className: 'zmem-markdown', 'aria-label': 'Markdown 只读正文' },
    frontmatter ? h('pre', { className: 'zmem-frontmatter', 'aria-label': '记忆元数据' }, frontmatter) : null,
    rendered);
}
