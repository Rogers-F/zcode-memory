// Apache-2.0. DSH client module; includes marked (MIT). See NOTICE.md.
window.__ModuleLoader__.load({id:"@local/zcode-memory-dsh",factory:(require)=>{var module={exports:{}};var exports=module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  PACKAGE_NAME: () => PACKAGE_NAME,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react3 = require("react");

// src/client/view.js
var import_react2 = require("react");

// src/client/model.js
var MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
var SETTINGS_NOTICE = "\u5728\u5DE5\u4F5C\u533A\u4E2D\u4FDD\u5B58\u5E76\u590D\u7528\u957F\u671F\u4E0A\u4E0B\u6587\uFF0C\u65B0\u4F1A\u8BDD\u751F\u6548\u3002\u5F00\u542F\u540E\u53EF\u80FD\u589E\u52A0\u6A21\u578B\u8C03\u7528\u548C Token \u6210\u672C\u3002";
var PROVIDER_NOTICE = "\u8BB0\u5FC6\u4FDD\u5B58\u5728\u672C\u673A DSH \u79C1\u6709\u76EE\u5F55\uFF0C\u9ED8\u8BA4\u9879\u76EE\u8BB0\u5FC6\u4E0D\u4FEE\u6539\u5DE5\u4F5C\u533A\u9879\u76EE\u6587\u4EF6\uFF1B\u63D0\u53D6\u4E0E\u56DE\u5FC6\u4F1A\u628A\u76F8\u5173\u5BF9\u8BDD\u548C\u8BB0\u5FC6\u5185\u5BB9\u53D1\u9001\u7ED9\u4F60\u9009\u62E9\u7684\u6A21\u578B\u670D\u52A1\u5546\uFF0C\u5E76\u975E\u6240\u6709\u5185\u5BB9\u90FD\u6C38\u4E0D\u79BB\u5F00\u672C\u673A\u3002\u5173\u95ED\u4E0D\u4F1A\u5220\u9664\u5DF2\u6709\u8BB0\u5FC6\u3002";
var REMOTE_NOTICE = "\u8FDC\u7AEF\u8FDE\u63A5\u4E0D\u8BFB\u53D6\u672C\u5730\u8BB0\u5FC6\u76EE\u5F55\u3002\u8BF7\u5728\u8FD0\u884C\u8BE5\u5DE5\u4F5C\u533A\u7684\u672C\u5730 DSH \u4E2D\u67E5\u770B\u8BB0\u5FC6\uFF1B\u4E0D\u4F1A\u56DE\u9000\u8BBF\u95EE\u6D4F\u89C8\u5668\u6240\u5728\u673A\u5668\u7684 localhost\u3002";
var MemoryClientError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MemoryClientError";
    this.code = code;
  }
};
var ERROR_TEXT = {
  // 文件级文案与 ZCode zh-CN settings.memory.viewer.file* 逐字一致。
  FILE_TOO_LARGE: "\u8BE5\u8BB0\u5FC6\u6587\u4EF6\u8D85\u8FC7 5 MiB \u9884\u89C8\u4E0A\u9650\u3002",
  FILE_CHANGED: "\u8BE5\u8BB0\u5FC6\u6587\u4EF6\u5728\u8BFB\u53D6\u671F\u95F4\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u6216\u5237\u65B0\u6587\u4EF6\u5217\u8868\u3002",
  FILE_NOT_FOUND: "\u8BE5\u8BB0\u5FC6\u6587\u4EF6\u5DF2\u88AB\u5220\u9664\uFF0C\u8BF7\u5237\u65B0\u6587\u4EF6\u5217\u8868\u3002",
  INVALID_PATH: "\u6587\u4EF6\u8DEF\u5F84\u4E0D\u5B89\u5168\u6216\u5B58\u5728\u7B26\u53F7\u94FE\u63A5\u3001\u8DEF\u5F84\u904D\u5386\u3001\u5927\u5C0F\u5199\u522B\u540D\uFF0C\u5DF2\u62D2\u7EDD\u8BBF\u95EE\u3002",
  LOCAL_ONLY: REMOTE_NOTICE,
  MEMORY_DISABLED: "\u5DE5\u4F5C\u533A\u8BB0\u5FC6\u5DF2\u5173\u95ED\u3002\u5F00\u542F\u540E\u53EF\u67E5\u770B\u5DF2\u6709\u6587\u4EF6\uFF0C\u5173\u95ED\u4E0D\u4F1A\u5220\u9664\u6570\u636E\u3002",
  UNAUTHORIZED: "DSH \u6388\u6743\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u540E\u5237\u65B0\u3002",
  INVALID_RESPONSE: "\u8BB0\u5FC6\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u6570\u636E\uFF0C\u8BF7\u68C0\u67E5\u63D2\u4EF6\u7248\u672C\u540E\u5237\u65B0\u3002"
};
function errorMessage(error) {
  return ERROR_TEXT[error?.code] ?? (error instanceof Error ? error.message : String(error));
}
function filterFiles(files, query) {
  const needle = query.trim().toLocaleLowerCase();
  return files.filter((file) => file.name.toLocaleLowerCase().includes(needle));
}
var MINUTE_MS = 6e4;
var RELATIVE_MINUTES_LIMIT = 30;
var WEEKDAY_ZH = "\u65E5\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D";
var WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function startOfLocalDay(timestamp2) {
  const date = new Date(timestamp2);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function formatClock(timestamp2) {
  const date = new Date(timestamp2);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function formatMemoryUpdatedAt({ now, updatedAt, lang = "zh" }) {
  const zh = lang !== "en";
  const elapsedMs = now - updatedAt;
  if (!Number.isFinite(updatedAt) || Number.isNaN(elapsedMs) || elapsedMs < MINUTE_MS) {
    return zh ? "\u521A\u521A" : "Just now";
  }
  const elapsedMinutes = Math.floor(elapsedMs / MINUTE_MS);
  if (elapsedMinutes < RELATIVE_MINUTES_LIMIT) {
    return zh ? `${elapsedMinutes} \u5206\u949F\u524D` : `${elapsedMinutes} min ago`;
  }
  const time = formatClock(updatedAt);
  const todayStart = startOfLocalDay(now);
  const updatedDayStart = startOfLocalDay(updatedAt);
  if (updatedDayStart === todayStart) return zh ? `\u4ECA\u5929 ${time}` : `Today ${time}`;
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (updatedDayStart === yesterdayStart.getTime()) return zh ? `\u6628\u5929 ${time}` : `Yesterday ${time}`;
  const today = new Date(todayStart);
  const weekStart = new Date(todayStart);
  weekStart.setDate(today.getDate() - (today.getDay() + 6) % 7);
  if (updatedDayStart >= weekStart.getTime()) {
    const weekday = new Date(updatedAt).getDay();
    return zh ? `\u5468${WEEKDAY_ZH[weekday] ?? ""} ${time}` : `${WEEKDAY_EN[weekday]} ${time}`;
  }
  const date = new Date(updatedAt);
  const includeYear = date.getFullYear() !== today.getFullYear();
  if (zh) {
    return includeYear ? `${date.getFullYear()} \u5E74 ${date.getMonth() + 1} \u6708 ${date.getDate()} \u65E5 ${time}` : `${date.getMonth() + 1} \u6708 ${date.getDate()} \u65E5 ${time}`;
  }
  return includeYear ? `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}` : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
function viewerMode(state) {
  if (state.settingsStatus === "loading" || state.settingsStatus === "idle") return "loading";
  if (state.settingsStatus === "error") return "error";
  if (!state.settings.local) return "remote";
  if (!state.settings.enabled) return "disabled";
  if (state.saving) return "loading";
  if (state.catalogStatus === "error") return "error";
  if (state.catalogStatus === "loading") return "loading";
  return state.workspaces.length ? "ready" : "empty";
}
var MemoryModel = class {
  constructor(api) {
    this.api = api;
    this.listeners = /* @__PURE__ */ new Set();
    this.requests = /* @__PURE__ */ new Map();
    this.disposed = false;
    this.state = {
      settings: { enabled: false, local: false, sessionScoped: true, branch: "default-index" },
      settingsStatus: "idle",
      settingsError: null,
      saving: false,
      saveError: null,
      catalogStatus: "idle",
      catalogError: null,
      workspaces: [],
      workspaceId: null,
      fileName: null,
      query: "",
      previewStatus: "idle",
      previewError: null,
      preview: null
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  patch(values) {
    if (this.disposed) return;
    this.state = { ...this.state, ...values };
    for (const listener of this.listeners) listener();
  }
  cancel(...keys) {
    for (const key of keys) {
      this.requests.get(key)?.abort();
      this.requests.delete(key);
    }
  }
  begin(key) {
    this.cancel(key);
    const controller = new AbortController();
    this.requests.set(key, controller);
    return {
      signal: controller.signal,
      current: () => !this.disposed && this.requests.get(key) === controller && !controller.signal.aborted
    };
  }
  clearViewer() {
    this.cancel("catalog", "preview");
    this.patch({
      catalogStatus: "idle",
      catalogError: null,
      workspaces: [],
      workspaceId: null,
      fileName: null,
      previewStatus: "idle",
      previewError: null,
      preview: null
    });
  }
  async start() {
    this.disposed = false;
    return this.refresh();
  }
  dispose() {
    this.disposed = true;
    this.cancel("settings", "catalog", "preview", "save");
  }
  async refresh() {
    if (this.disposed || this.state.saving) return;
    this.cancel("catalog", "preview");
    const request = this.begin("settings");
    this.patch({
      settingsStatus: "loading",
      settingsError: null,
      saveError: null,
      previewStatus: "idle",
      previewError: null,
      preview: null
    });
    try {
      const settings = await this.api.getSettings(request.signal);
      if (!request.current()) return;
      this.patch({ settings, settingsStatus: "ready" });
      if (settings.enabled && settings.local) await this.loadCatalog();
      else this.clearViewer();
    } catch (error) {
      if (!request.current()) return;
      this.clearViewer();
      this.patch({ settingsStatus: "error", settingsError: errorMessage(error) });
    }
  }
  async setEnabled(enabled) {
    if (this.disposed || this.state.saving || this.state.settingsStatus !== "ready" || this.state.settings.writable === false) return;
    this.cancel("settings");
    this.clearViewer();
    const request = this.begin("save");
    this.patch({ saving: true, saveError: null });
    try {
      const settings = await this.api.setSettings({ enabled }, request.signal);
      if (!request.current()) return;
      this.patch({ settings, saving: false });
      if (settings.enabled && settings.local) await this.loadCatalog();
    } catch (error) {
      if (!request.current()) return;
      this.patch({ saving: false, saveError: errorMessage(error) });
      if (this.state.settings.enabled && this.state.settings.local) await this.loadCatalog();
    }
  }
  async loadCatalog() {
    if (this.disposed || !this.state.settings.enabled || !this.state.settings.local) return;
    const request = this.begin("catalog");
    this.patch({ catalogStatus: "loading", catalogError: null });
    try {
      const { workspaces } = await this.api.getWorkspaces(request.signal);
      if (!request.current()) return;
      const workspace = workspaces.find((item) => item.id === this.state.workspaceId) ?? workspaces[0];
      const file = workspace?.files.find((item) => item.name === this.state.fileName) ?? workspace?.files[0];
      this.patch({
        workspaces,
        catalogStatus: "ready",
        workspaceId: workspace?.id ?? null,
        fileName: null,
        preview: null,
        previewError: null,
        previewStatus: "idle"
      });
      if (file) await this.selectFile(file.name);
    } catch (error) {
      if (!request.current()) return;
      this.clearViewer();
      this.patch({ catalogStatus: "error", catalogError: errorMessage(error) });
    }
  }
  setQuery(query) {
    this.patch({ query });
  }
  async selectWorkspace(id) {
    if (this.disposed || !this.state.settings.enabled || !this.state.settings.local || this.state.saving) return;
    const workspace = this.state.workspaces.find((item) => item.id === id);
    if (!workspace) return;
    this.cancel("preview");
    this.patch({
      workspaceId: id,
      fileName: null,
      preview: null,
      previewStatus: "idle",
      previewError: null
    });
    if (workspace.files[0]) await this.selectFile(workspace.files[0].name);
  }
  async selectFile(name) {
    if (this.disposed || !this.state.settings.enabled || !this.state.settings.local || this.state.saving) return;
    const workspace = this.state.workspaces.find((item) => item.id === this.state.workspaceId);
    const file = workspace?.files.find((item) => item.name === name);
    if (!file) return;
    const request = this.begin("preview");
    this.patch({ fileName: name, preview: null, previewError: null, previewStatus: "loading" });
    try {
      if (file.size > MAX_PREVIEW_BYTES) throw new MemoryClientError("FILE_TOO_LARGE", "File exceeds 5 MiB");
      const preview = await this.api.getFile(workspace.id, name, request.signal);
      if (!request.current()) return;
      if (new TextEncoder().encode(preview.content).byteLength > MAX_PREVIEW_BYTES) {
        throw new MemoryClientError("FILE_TOO_LARGE", "File exceeds 5 MiB");
      }
      this.patch({ previewStatus: "ready", preview });
    } catch (error) {
      if (!request.current()) return;
      this.patch({ previewStatus: "error", previewError: errorMessage(error), preview: null });
    }
  }
};

// src/client/markdown.js
var import_react = require("react");

// node_modules/marked/lib/marked.esm.js
function L() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var T = L();
function G(l3) {
  T = l3;
}
var E = { exec: () => null };
function d(l3, e = "") {
  let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (r, i) => {
    let s = typeof i == "string" ? i : i.source;
    return s = s.replace(m.caret, "$1"), t = t.replace(r, s), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var be = (() => {
  try {
    return !!new RegExp("(?<=1)(?<!1)");
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceTabs: /^\t+/, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] /, listReplaceTask: /^\[[ xX]\] +/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}#`), htmlBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}<(?:[a-z].*>|!--)`, "i") };
var Re = /^(?:[ \t]*(?:\n|$))+/;
var Te = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var Oe = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var I = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var we = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var F = /(?:[*+-]|\d{1,9}[.)])/;
var ie = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var oe = d(ie).replace(/bull/g, F).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var ye = d(ie).replace(/bull/g, F).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var j = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var Pe = /^[^\n]+/;
var Q = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var Se = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", Q).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var $e = d(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, F).getRegex();
var v = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var U = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var _e = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", U).replace("tag", v).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var ae = d(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Le = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ae).getRegex();
var K = { blockquote: Le, code: Te, def: Se, fences: Oe, heading: we, hr: I, html: _e, lheading: oe, list: $e, newline: Re, paragraph: ae, table: E, text: Pe };
var re = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Me = { ...K, lheading: ye, table: re, paragraph: d(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", re).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex() };
var ze = { ...K, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", U).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: E, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(j).replace("hr", I).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", oe).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ee = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var le = /^( {2,}|\\)\n(?!\s*$)/;
var Ie = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var D = /[\p{P}\p{S}]/u;
var W = /[\s\p{P}\p{S}]/u;
var ue = /[^\s\p{P}\p{S}]/u;
var Ce = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, W).getRegex();
var pe = /(?!~)[\p{P}\p{S}]/u;
var Be = /(?!~)[\s\p{P}\p{S}]/u;
var qe = /(?:[^\s\p{P}\p{S}]|~)/u;
var ve = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", be ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var ce = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
var De = d(ce, "u").replace(/punct/g, D).getRegex();
var He = d(ce, "u").replace(/punct/g, pe).getRegex();
var he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ze = d(he, "gu").replace(/notPunctSpace/g, ue).replace(/punctSpace/g, W).replace(/punct/g, D).getRegex();
var Ge = d(he, "gu").replace(/notPunctSpace/g, qe).replace(/punctSpace/g, Be).replace(/punct/g, pe).getRegex();
var Ne = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, ue).replace(/punctSpace/g, W).replace(/punct/g, D).getRegex();
var Fe = d(/\\(punct)/, "gu").replace(/punct/g, D).getRegex();
var je = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var Qe = d(U).replace("(?:-->|$)", "-->").getRegex();
var Ue = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Qe).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var q = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+[^`]*?`+(?!`)|[^\[\]\\`])*?/;
var Ke = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", q).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var de = d(/^!?\[(label)\]\[(ref)\]/).replace("label", q).replace("ref", Q).getRegex();
var ke = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", Q).getRegex();
var We = d("reflink|nolink(?!\\()", "g").replace("reflink", de).replace("nolink", ke).getRegex();
var se = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var X = { _backpedal: E, anyPunctuation: Fe, autolink: je, blockSkip: ve, br: le, code: Ee, del: E, emStrongLDelim: De, emStrongRDelimAst: Ze, emStrongRDelimUnd: Ne, escape: Ae, link: Ke, nolink: ke, punctuation: Ce, reflink: de, reflinkSearch: We, tag: Ue, text: Ie, url: E };
var Xe = { ...X, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", q).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", q).getRegex() };
var N = { ...X, emStrongRDelimAst: Ge, emStrongLDelim: He, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", se).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", se).getRegex() };
var Je = { ...N, br: d(le).replace("{2,}", "*").getRegex(), text: d(N.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var C = { normal: K, gfm: Me, pedantic: ze };
var M = { normal: X, gfm: N, breaks: Je, pedantic: Xe };
var Ve = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var ge = (l3) => Ve[l3];
function w(l3, e) {
  if (e) {
    if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, ge);
  } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, ge);
  return l3;
}
function J(l3) {
  try {
    l3 = encodeURI(l3).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return l3;
}
function V(l3, e) {
  let t = l3.replace(m.findPipe, (i, s, a) => {
    let o = false, p = s;
    for (; --p >= 0 && a[p] === "\\"; ) o = !o;
    return o ? "|" : " |";
  }), n = t.split(m.splitPipe), r = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; r < n.length; r++) n[r] = n[r].trim().replace(m.slashPipe, "|");
  return n;
}
function z(l3, e, t) {
  let n = l3.length;
  if (n === 0) return "";
  let r = 0;
  for (; r < n; ) {
    let i = l3.charAt(n - r - 1);
    if (i === e && !t) r++;
    else if (i !== e && t) r++;
    else break;
  }
  return l3.slice(0, n - r);
}
function fe(l3, e) {
  if (l3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
  else if (l3[n] === e[0]) t++;
  else if (l3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function me(l3, e, t, n, r) {
  let i = e.href, s = e.title || null, a = l3[1].replace(r.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let o = { type: l3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: i, title: s, text: a, tokens: n.inlineTokens(a) };
  return n.state.inLink = false, o;
}
function Ye(l3, e, t) {
  let n = l3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let r = n[1];
  return e.split(`
`).map((i) => {
    let s = i.match(t.other.beginningSpace);
    if (s === null) return i;
    let [a] = s;
    return a.length >= r.length ? i.slice(r.length) : i;
  }).join(`
`);
}
var y = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = t[0].replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: t[0], codeBlockStyle: "indented", text: this.options.pedantic ? n : z(n, `
`) };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], r = Ye(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: r };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let r = z(n, "#");
        (this.options.pedantic || !r || this.rules.other.endingSpaceChar.test(r)) && (n = r.trim());
      }
      return { type: "heading", raw: t[0], depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: z(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = z(t[0], `
`).split(`
`), r = "", i = "", s = [];
      for (; n.length > 0; ) {
        let a = false, o = [], p;
        for (p = 0; p < n.length; p++) if (this.rules.other.blockquoteStart.test(n[p])) o.push(n[p]), a = true;
        else if (!a) o.push(n[p]);
        else break;
        n = n.slice(p);
        let u = o.join(`
`), c = u.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        r = r ? `${r}
${u}` : u, i = i ? `${i}
${c}` : c;
        let g = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c, s, true), this.lexer.state.top = g, n.length === 0) break;
        let h4 = s.at(-1);
        if (h4?.type === "code") break;
        if (h4?.type === "blockquote") {
          let R = h4, f = R.raw + `
` + n.join(`
`), O = this.blockquote(f);
          s[s.length - 1] = O, r = r.substring(0, r.length - R.raw.length) + O.raw, i = i.substring(0, i.length - R.text.length) + O.text;
          break;
        } else if (h4?.type === "list") {
          let R = h4, f = R.raw + `
` + n.join(`
`), O = this.list(f);
          s[s.length - 1] = O, r = r.substring(0, r.length - h4.raw.length) + O.raw, i = i.substring(0, i.length - R.raw.length) + O.raw, n = f.substring(s.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: r, tokens: s, text: i };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), r = n.length > 1, i = { type: "list", raw: "", ordered: r, start: r ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = r ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = r ? n : "[*+-]");
      let s = this.rules.other.listItemRegex(n), a = false;
      for (; e; ) {
        let p = false, u = "", c = "";
        if (!(t = s.exec(e)) || this.rules.block.hr.test(e)) break;
        u = t[0], e = e.substring(u.length);
        let g = t[2].split(`
`, 1)[0].replace(this.rules.other.listReplaceTabs, (H) => " ".repeat(3 * H.length)), h4 = e.split(`
`, 1)[0], R = !g.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, c = g.trimStart()) : R ? f = t[1].length + 1 : (f = t[2].search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, c = g.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h4) && (u += h4 + `
`, e = e.substring(h4.length + 1), p = true), !p) {
          let H = this.rules.other.nextBulletRegex(f), ee = this.rules.other.hrRegex(f), te = this.rules.other.fencesBeginRegex(f), ne = this.rules.other.headingBeginRegex(f), xe = this.rules.other.htmlBeginRegex(f);
          for (; e; ) {
            let Z = e.split(`
`, 1)[0], A;
            if (h4 = Z, this.options.pedantic ? (h4 = h4.replace(this.rules.other.listReplaceNesting, "  "), A = h4) : A = h4.replace(this.rules.other.tabCharGlobal, "    "), te.test(h4) || ne.test(h4) || xe.test(h4) || H.test(h4) || ee.test(h4)) break;
            if (A.search(this.rules.other.nonSpaceChar) >= f || !h4.trim()) c += `
` + A.slice(f);
            else {
              if (R || g.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || te.test(g) || ne.test(g) || ee.test(g)) break;
              c += `
` + h4;
            }
            !R && !h4.trim() && (R = true), u += Z + `
`, e = e.substring(Z.length + 1), g = A.slice(f);
          }
        }
        i.loose || (a ? i.loose = true : this.rules.other.doubleBlankLine.test(u) && (a = true));
        let O = null, Y;
        this.options.gfm && (O = this.rules.other.listIsTask.exec(c), O && (Y = O[0] !== "[ ] ", c = c.replace(this.rules.other.listReplaceTask, ""))), i.items.push({ type: "list_item", raw: u, task: !!O, checked: Y, loose: false, text: c, tokens: [] }), i.raw += u;
      }
      let o = i.items.at(-1);
      if (o) o.raw = o.raw.trimEnd(), o.text = o.text.trimEnd();
      else return;
      i.raw = i.raw.trimEnd();
      for (let p = 0; p < i.items.length; p++) if (this.lexer.state.top = false, i.items[p].tokens = this.lexer.blockTokens(i.items[p].text, []), !i.loose) {
        let u = i.items[p].tokens.filter((g) => g.type === "space"), c = u.length > 0 && u.some((g) => this.rules.other.anyLine.test(g.raw));
        i.loose = c;
      }
      if (i.loose) for (let p = 0; p < i.items.length; p++) i.items[p].loose = true;
      return i;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) return { type: "html", block: true, raw: t[0], pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: t[0] };
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), r = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", i = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: t[0], href: r, title: i };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = V(t[1]), r = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), i = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], s = { type: "table", raw: t[0], header: [], align: [], rows: [] };
    if (n.length === r.length) {
      for (let a of r) this.rules.other.tableAlignRight.test(a) ? s.align.push("right") : this.rules.other.tableAlignCenter.test(a) ? s.align.push("center") : this.rules.other.tableAlignLeft.test(a) ? s.align.push("left") : s.align.push(null);
      for (let a = 0; a < n.length; a++) s.header.push({ text: n[a], tokens: this.lexer.inline(n[a]), header: true, align: s.align[a] });
      for (let a of i) s.rows.push(V(a, s.header.length).map((o, p) => ({ text: o, tokens: this.lexer.inline(o), header: false, align: s.align[p] })));
      return s;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) return { type: "heading", raw: t[0], depth: t[2].charAt(0) === "=" ? 1 : 2, text: t[1], tokens: this.lexer.inline(t[1]) };
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let s = z(n.slice(0, -1), "\\");
        if ((n.length - s.length) % 2 === 0) return;
      } else {
        let s = fe(t[2], "()");
        if (s === -2) return;
        if (s > -1) {
          let o = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + s;
          t[2] = t[2].substring(0, s), t[0] = t[0].substring(0, o).trim(), t[3] = "";
        }
      }
      let r = t[2], i = "";
      if (this.options.pedantic) {
        let s = this.rules.other.pedanticHrefTitle.exec(r);
        s && (r = s[1], i = s[3]);
      } else i = t[3] ? t[3].slice(1, -1) : "";
      return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? r = r.slice(1) : r = r.slice(1, -1)), me(t, { href: r && r.replace(this.rules.inline.anyPunctuation, "$1"), title: i && i.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let r = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), i = t[r.toLowerCase()];
      if (!i) {
        let s = n[0].charAt(0);
        return { type: "text", raw: s, text: s };
      }
      return me(n, i, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let r = this.rules.inline.emStrongLDelim.exec(e);
    if (!r || r[3] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(r[1] || r[2] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let s = [...r[0]].length - 1, a, o, p = s, u = 0, c = r[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (c.lastIndex = 0, t = t.slice(-1 * e.length + s); (r = c.exec(t)) != null; ) {
        if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a) continue;
        if (o = [...a].length, r[3] || r[4]) {
          p += o;
          continue;
        } else if ((r[5] || r[6]) && s % 3 && !((s + o) % 3)) {
          u += o;
          continue;
        }
        if (p -= o, p > 0) continue;
        o = Math.min(o, o + p + u);
        let g = [...r[0]][0].length, h4 = e.slice(0, s + r.index + g + o);
        if (Math.min(s, o) % 2) {
          let f = h4.slice(1, -1);
          return { type: "em", raw: h4, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let R = h4.slice(2, -2);
        return { type: "strong", raw: h4, text: R, tokens: this.lexer.inlineTokens(R) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), r = this.rules.other.nonSpaceChar.test(n), i = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return r && i && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e) {
    let t = this.rules.inline.del.exec(e);
    if (t) return { type: "del", raw: t[0], text: t[2], tokens: this.lexer.inlineTokens(t[2]) };
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, r;
      return t[2] === "@" ? (n = t[1], r = "mailto:" + n) : (n = t[1], r = n), { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, r;
      if (t[2] === "@") n = t[0], r = "mailto:" + n;
      else {
        let i;
        do
          i = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (i !== t[0]);
        n = t[0], t[1] === "www." ? r = "http://" + t[0] : r = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class l {
  tokens;
  options;
  state;
  tokenizer;
  inlineQueue;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new y(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: C.normal, inline: M.normal };
    this.options.pedantic ? (t.block = C.pedantic, t.inline = M.pedantic) : this.options.gfm && (t.block = C.gfm, this.options.breaks ? t.inline = M.breaks : t.inline = M.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: C, inline: M };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    for (this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, "")); e; ) {
      let r;
      if (this.options.extensions?.block?.some((s) => (r = s.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        r.raw.length === 1 && s !== void 0 ? s.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.raw, this.inlineQueue.at(-1).src = s.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let s = 1 / 0, a = e.slice(1), o;
        this.options.extensions.startBlock.forEach((p) => {
          o = p.call({ lexer: this }, a), typeof o == "number" && o >= 0 && (s = Math.min(s, o));
        }), s < 1 / 0 && s >= 0 && (i = e.substring(0, s + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let s = t.at(-1);
        n && s?.type === "paragraph" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (e) {
        let s = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(s);
          break;
        } else throw new Error(s);
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    let n = e, r = null;
    if (this.tokens.links) {
      let o = Object.keys(this.tokens.links);
      if (o.length > 0) for (; (r = this.tokenizer.rules.inline.reflinkSearch.exec(n)) != null; ) o.includes(r[0].slice(r[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, r.index) + "[" + "a".repeat(r[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (r = this.tokenizer.rules.inline.anyPunctuation.exec(n)) != null; ) n = n.slice(0, r.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let i;
    for (; (r = this.tokenizer.rules.inline.blockSkip.exec(n)) != null; ) i = r[2] ? r[2].length : 0, n = n.slice(0, r.index + i) + "[" + "a".repeat(r[0].length - i - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let s = false, a = "";
    for (; e; ) {
      s || (a = ""), s = false;
      let o;
      if (this.options.extensions?.inline?.some((u) => (o = u.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), true) : false)) continue;
      if (o = this.tokenizer.escape(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.tag(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.link(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(o.raw.length);
        let u = t.at(-1);
        o.type === "text" && u?.type === "text" ? (u.raw += o.raw, u.text += o.text) : t.push(o);
        continue;
      }
      if (o = this.tokenizer.emStrong(e, n, a)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.codespan(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.br(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.del(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.autolink(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (!this.state.inLink && (o = this.tokenizer.url(e))) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      let p = e;
      if (this.options.extensions?.startInline) {
        let u = 1 / 0, c = e.slice(1), g;
        this.options.extensions.startInline.forEach((h4) => {
          g = h4.call({ lexer: this }, c), typeof g == "number" && g >= 0 && (u = Math.min(u, g));
        }), u < 1 / 0 && u >= 0 && (p = e.substring(0, u + 1));
      }
      if (o = this.tokenizer.inlineText(p)) {
        e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (a = o.raw.slice(-1)), s = true;
        let u = t.at(-1);
        u?.type === "text" ? (u.raw += o.raw, u.text += o.text) : t.push(o);
        continue;
      }
      if (e) {
        let u = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(u);
          break;
        } else throw new Error(u);
      }
    }
    return t;
  }
};
var P = class {
  options;
  parser;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let r = (t || "").match(m.notSpaceStart)?.[0], i = e.replace(m.endingNewline, "") + `
`;
    return r ? '<pre><code class="language-' + w(r) + '">' + (n ? i : w(i, true)) + `</code></pre>
` : "<pre><code>" + (n ? i : w(i, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, r = "";
    for (let a = 0; a < e.items.length; a++) {
      let o = e.items[a];
      r += this.listitem(o);
    }
    let i = t ? "ol" : "ul", s = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + i + s + `>
` + r + "</" + i + `>
`;
  }
  listitem(e) {
    let t = "";
    if (e.task) {
      let n = this.checkbox({ checked: !!e.checked });
      e.loose ? e.tokens[0]?.type === "paragraph" ? (e.tokens[0].text = n + " " + e.tokens[0].text, e.tokens[0].tokens && e.tokens[0].tokens.length > 0 && e.tokens[0].tokens[0].type === "text" && (e.tokens[0].tokens[0].text = n + " " + w(e.tokens[0].tokens[0].text), e.tokens[0].tokens[0].escaped = true)) : e.tokens.unshift({ type: "text", raw: n + " ", text: n + " ", escaped: true }) : t += n + " ";
    }
    return t += this.parser.parse(e.tokens, !!e.loose), `<li>${t}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let i = 0; i < e.header.length; i++) n += this.tablecell(e.header[i]);
    t += this.tablerow({ text: n });
    let r = "";
    for (let i = 0; i < e.rows.length; i++) {
      let s = e.rows[i];
      n = "";
      for (let a = 0; a < s.length; a++) n += this.tablecell(s[a]);
      r += this.tablerow({ text: n });
    }
    return r && (r = `<tbody>${r}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + r + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${w(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let r = this.parser.parseInline(n), i = J(e);
    if (i === null) return r;
    e = i;
    let s = '<a href="' + e + '"';
    return t && (s += ' title="' + w(t) + '"'), s += ">" + r + "</a>", s;
  }
  image({ href: e, title: t, text: n, tokens: r }) {
    r && (n = this.parser.parseInline(r, this.parser.textRenderer));
    let i = J(e);
    if (i === null) return w(n);
    e = i;
    let s = `<img src="${e}" alt="${n}"`;
    return t && (s += ` title="${w(t)}"`), s += ">", s;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : w(e.text);
  }
};
var $ = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
};
var b = class l2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || T, this.options.renderer = this.options.renderer || new P(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new $();
  }
  static parse(e, t) {
    return new l2(t).parse(e);
  }
  static parseInline(e, t) {
    return new l2(t).parseInline(e);
  }
  parse(e, t = true) {
    let n = "";
    for (let r = 0; r < e.length; r++) {
      let i = e[r];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = i, o = this.options.extensions.renderers[a.type].call({ parser: this }, a);
        if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(a.type)) {
          n += o || "";
          continue;
        }
      }
      let s = i;
      switch (s.type) {
        case "space": {
          n += this.renderer.space(s);
          continue;
        }
        case "hr": {
          n += this.renderer.hr(s);
          continue;
        }
        case "heading": {
          n += this.renderer.heading(s);
          continue;
        }
        case "code": {
          n += this.renderer.code(s);
          continue;
        }
        case "table": {
          n += this.renderer.table(s);
          continue;
        }
        case "blockquote": {
          n += this.renderer.blockquote(s);
          continue;
        }
        case "list": {
          n += this.renderer.list(s);
          continue;
        }
        case "html": {
          n += this.renderer.html(s);
          continue;
        }
        case "def": {
          n += this.renderer.def(s);
          continue;
        }
        case "paragraph": {
          n += this.renderer.paragraph(s);
          continue;
        }
        case "text": {
          let a = s, o = this.renderer.text(a);
          for (; r + 1 < e.length && e[r + 1].type === "text"; ) a = e[++r], o += `
` + this.renderer.text(a);
          t ? n += this.renderer.paragraph({ type: "paragraph", raw: o, text: o, tokens: [{ type: "text", raw: o, text: o, escaped: true }] }) : n += o;
          continue;
        }
        default: {
          let a = 'Token with "' + s.type + '" type was not found.';
          if (this.options.silent) return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return n;
  }
  parseInline(e, t = this.renderer) {
    let n = "";
    for (let r = 0; r < e.length; r++) {
      let i = e[r];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (a !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(i.type)) {
          n += a || "";
          continue;
        }
      }
      let s = i;
      switch (s.type) {
        case "escape": {
          n += t.text(s);
          break;
        }
        case "html": {
          n += t.html(s);
          break;
        }
        case "link": {
          n += t.link(s);
          break;
        }
        case "image": {
          n += t.image(s);
          break;
        }
        case "strong": {
          n += t.strong(s);
          break;
        }
        case "em": {
          n += t.em(s);
          break;
        }
        case "codespan": {
          n += t.codespan(s);
          break;
        }
        case "br": {
          n += t.br(s);
          break;
        }
        case "del": {
          n += t.del(s);
          break;
        }
        case "text": {
          n += t.text(s);
          break;
        }
        default: {
          let a = 'Token with "' + s.type + '" type was not found.';
          if (this.options.silent) return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return n;
  }
};
var S = class {
  options;
  block;
  constructor(e) {
    this.options = e || T;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer() {
    return this.block ? x.lex : x.lexInline;
  }
  provideParser() {
    return this.block ? b.parse : b.parseInline;
  }
};
var B = class {
  defaults = L();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = P;
  TextRenderer = $;
  Lexer = x;
  Tokenizer = y;
  Hooks = S;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let r of e) switch (n = n.concat(t.call(this, r)), r.type) {
      case "table": {
        let i = r;
        for (let s of i.header) n = n.concat(this.walkTokens(s.tokens, t));
        for (let s of i.rows) for (let a of s) n = n.concat(this.walkTokens(a.tokens, t));
        break;
      }
      case "list": {
        let i = r;
        n = n.concat(this.walkTokens(i.items, t));
        break;
      }
      default: {
        let i = r;
        this.defaults.extensions?.childTokens?.[i.type] ? this.defaults.extensions.childTokens[i.type].forEach((s) => {
          let a = i[s].flat(1 / 0);
          n = n.concat(this.walkTokens(a, t));
        }) : i.tokens && (n = n.concat(this.walkTokens(i.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let r = { ...n };
      if (r.async = this.defaults.async || r.async || false, n.extensions && (n.extensions.forEach((i) => {
        if (!i.name) throw new Error("extension name required");
        if ("renderer" in i) {
          let s = t.renderers[i.name];
          s ? t.renderers[i.name] = function(...a) {
            let o = i.renderer.apply(this, a);
            return o === false && (o = s.apply(this, a)), o;
          } : t.renderers[i.name] = i.renderer;
        }
        if ("tokenizer" in i) {
          if (!i.level || i.level !== "block" && i.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let s = t[i.level];
          s ? s.unshift(i.tokenizer) : t[i.level] = [i.tokenizer], i.start && (i.level === "block" ? t.startBlock ? t.startBlock.push(i.start) : t.startBlock = [i.start] : i.level === "inline" && (t.startInline ? t.startInline.push(i.start) : t.startInline = [i.start]));
        }
        "childTokens" in i && i.childTokens && (t.childTokens[i.name] = i.childTokens);
      }), r.extensions = t), n.renderer) {
        let i = this.defaults.renderer || new P(this.defaults);
        for (let s in n.renderer) {
          if (!(s in i)) throw new Error(`renderer '${s}' does not exist`);
          if (["options", "parser"].includes(s)) continue;
          let a = s, o = n.renderer[a], p = i[a];
          i[a] = (...u) => {
            let c = o.apply(i, u);
            return c === false && (c = p.apply(i, u)), c || "";
          };
        }
        r.renderer = i;
      }
      if (n.tokenizer) {
        let i = this.defaults.tokenizer || new y(this.defaults);
        for (let s in n.tokenizer) {
          if (!(s in i)) throw new Error(`tokenizer '${s}' does not exist`);
          if (["options", "rules", "lexer"].includes(s)) continue;
          let a = s, o = n.tokenizer[a], p = i[a];
          i[a] = (...u) => {
            let c = o.apply(i, u);
            return c === false && (c = p.apply(i, u)), c;
          };
        }
        r.tokenizer = i;
      }
      if (n.hooks) {
        let i = this.defaults.hooks || new S();
        for (let s in n.hooks) {
          if (!(s in i)) throw new Error(`hook '${s}' does not exist`);
          if (["options", "block"].includes(s)) continue;
          let a = s, o = n.hooks[a], p = i[a];
          S.passThroughHooks.has(s) ? i[a] = (u) => {
            if (this.defaults.async && S.passThroughHooksRespectAsync.has(s)) return (async () => {
              let g = await o.call(i, u);
              return p.call(i, g);
            })();
            let c = o.call(i, u);
            return p.call(i, c);
          } : i[a] = (...u) => {
            if (this.defaults.async) return (async () => {
              let g = await o.apply(i, u);
              return g === false && (g = await p.apply(i, u)), g;
            })();
            let c = o.apply(i, u);
            return c === false && (c = p.apply(i, u)), c;
          };
        }
        r.hooks = i;
      }
      if (n.walkTokens) {
        let i = this.defaults.walkTokens, s = n.walkTokens;
        r.walkTokens = function(a) {
          let o = [];
          return o.push(s.call(this, a)), i && (o = o.concat(i.call(this, a))), o;
        };
      }
      this.defaults = { ...this.defaults, ...r };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, r) => {
      let i = { ...r }, s = { ...this.defaults, ...i }, a = this.onError(!!s.silent, !!s.async);
      if (this.defaults.async === true && i.async === false) return a(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return a(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return a(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (s.hooks && (s.hooks.options = s, s.hooks.block = e), s.async) return (async () => {
        let o = s.hooks ? await s.hooks.preprocess(n) : n, u = await (s.hooks ? await s.hooks.provideLexer() : e ? x.lex : x.lexInline)(o, s), c = s.hooks ? await s.hooks.processAllTokens(u) : u;
        s.walkTokens && await Promise.all(this.walkTokens(c, s.walkTokens));
        let h4 = await (s.hooks ? await s.hooks.provideParser() : e ? b.parse : b.parseInline)(c, s);
        return s.hooks ? await s.hooks.postprocess(h4) : h4;
      })().catch(a);
      try {
        s.hooks && (n = s.hooks.preprocess(n));
        let p = (s.hooks ? s.hooks.provideLexer() : e ? x.lex : x.lexInline)(n, s);
        s.hooks && (p = s.hooks.processAllTokens(p)), s.walkTokens && this.walkTokens(p, s.walkTokens);
        let c = (s.hooks ? s.hooks.provideParser() : e ? b.parse : b.parseInline)(p, s);
        return s.hooks && (c = s.hooks.postprocess(c)), c;
      } catch (o) {
        return a(o);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let r = "<p>An error occurred:</p><pre>" + w(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(r) : r;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var _ = new B();
function k(l3, e) {
  return _.parse(l3, e);
}
k.options = k.setOptions = function(l3) {
  return _.setOptions(l3), k.defaults = _.defaults, G(k.defaults), k;
};
k.getDefaults = L;
k.defaults = T;
k.use = function(...l3) {
  return _.use(...l3), k.defaults = _.defaults, G(k.defaults), k;
};
k.walkTokens = function(l3, e) {
  return _.walkTokens(l3, e);
};
k.parseInline = _.parseInline;
k.Parser = b;
k.parser = b.parse;
k.Renderer = P;
k.TextRenderer = $;
k.Lexer = x;
k.lexer = x.lex;
k.Tokenizer = y;
k.Hooks = S;
k.parse = k;
var Zt = k.options;
var Gt = k.setOptions;
var Nt = k.use;
var Ft = k.walkTokens;
var jt = k.parseInline;
var Ut = b.parse;
var Kt = x.lex;

// src/client/markdown.js
function inline(tokens = []) {
  return tokens.map((token, key) => {
    const children = () => inline(token.tokens ?? [{ type: "text", text: token.text ?? token.raw ?? "" }]);
    switch (token.type) {
      case "strong":
        return (0, import_react.createElement)("strong", { key }, children());
      case "em":
        return (0, import_react.createElement)("em", { key }, children());
      case "del":
        return (0, import_react.createElement)("del", { key }, children());
      case "codespan":
        return (0, import_react.createElement)("code", { key }, token.text);
      case "br":
        return (0, import_react.createElement)("br", { key });
      case "link":
        return (0, import_react.createElement)("span", { key, className: "zmem-link", title: token.href }, children(), ` (${token.href})`);
      case "image":
        return (0, import_react.createElement)("span", { key, className: "zmem-muted" }, `[\u56FE\u7247\u672A\u52A0\u8F7D\uFF1A${token.text || token.href}]`);
      case "html":
        return (0, import_react.createElement)("code", { key }, token.raw ?? token.text);
      case "escape":
        return (0, import_react.createElement)("span", { key }, token.text);
      case "text":
        return (0, import_react.createElement)("span", { key }, token.tokens ? inline(token.tokens) : token.text);
      default:
        return (0, import_react.createElement)("span", { key }, token.raw ?? token.text ?? "");
    }
  });
}
function blocks(tokens) {
  return tokens.map((token, key) => {
    switch (token.type) {
      case "space":
        return null;
      case "heading":
        return (0, import_react.createElement)(`h${Math.max(1, Math.min(6, token.depth))}`, { key }, inline(token.tokens));
      case "paragraph":
      case "text":
        return (0, import_react.createElement)("p", { key }, inline(token.tokens ?? [{ type: "text", text: token.text }]));
      case "code":
        return (0, import_react.createElement)("pre", { key }, (0, import_react.createElement)("code", null, token.text));
      case "html":
        return (0, import_react.createElement)("pre", { key, className: "zmem-raw-html" }, token.raw ?? token.text);
      case "hr":
        return (0, import_react.createElement)("hr", { key });
      case "blockquote":
        return (0, import_react.createElement)("blockquote", { key }, blocks(token.tokens));
      case "list":
        return (0, import_react.createElement)(
          token.ordered ? "ol" : "ul",
          { key, ...token.ordered ? { start: token.start } : {} },
          token.items.map((item, index) => (0, import_react.createElement)("li", { key: index }, item.task ? (0, import_react.createElement)("input", { type: "checkbox", checked: item.checked, disabled: true, readOnly: true, "aria-label": item.checked ? "\u5DF2\u5B8C\u6210" : "\u672A\u5B8C\u6210" }) : null, blocks(item.tokens)))
        );
      case "table":
        return (0, import_react.createElement)("div", { key, className: "zmem-table" }, (0, import_react.createElement)(
          "table",
          null,
          (0, import_react.createElement)("thead", null, (0, import_react.createElement)("tr", null, token.header.map((cell, index) => (0, import_react.createElement)("th", { key: index }, inline(cell.tokens))))),
          (0, import_react.createElement)("tbody", null, token.rows.map((row, index) => (0, import_react.createElement)("tr", { key: index }, row.map((cell, cellIndex) => (0, import_react.createElement)("td", { key: cellIndex }, inline(cell.tokens))))))
        ));
      default:
        return (0, import_react.createElement)("pre", { key }, token.raw ?? token.text ?? "");
    }
  });
}
function MarkdownPreview({ content }) {
  const frontmatter = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(content)?.[0] ?? "";
  const body = content.slice(frontmatter.length);
  let rendered;
  try {
    rendered = blocks(k.lexer(body, { gfm: true }));
  } catch {
    rendered = (0, import_react.createElement)("pre", null, body);
  }
  return (0, import_react.createElement)(
    "article",
    { className: "zmem-markdown", "aria-label": "Markdown \u53EA\u8BFB\u6B63\u6587" },
    frontmatter ? (0, import_react.createElement)("pre", { className: "zmem-frontmatter", "aria-label": "\u8BB0\u5FC6\u5143\u6570\u636E" }, frontmatter) : null,
    rendered
  );
}

// src/client/styles.js
var styles = `
.zmem { color: var(--dsw-alias-label-primary, inherit); font: inherit; min-width: 0; display: grid; gap: 24px; font-size: 14px; line-height: 22px; }
.zmem * { box-sizing: border-box; }
.zmem h3, .zmem p { margin: 0; }
.zmem button { font: inherit; color: inherit; cursor: pointer; }
.zmem button:disabled { opacity: .5; cursor: not-allowed; }
.zmem-sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* SettingsGroupCard + SettingsRow */
.zmem-card { border: 1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4, #8884)); border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, transparent)); overflow: hidden; }
.zmem-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 12px 16px; }
.zmem-row-text { min-width: 0; }
.zmem-row-title { font-size: 14px; font-weight: 500; line-height: 22px; color: var(--dsw-alias-label-primary, inherit); }
.zmem-row-desc { margin-top: 4px; font-size: 14px; line-height: 24px; color: var(--dsw-alias-label-secondary, #888); }
.zmem-row-note { margin-top: 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #999); }
.zmem-inline-alert { margin-top: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary, #d64545); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.zmem-inline-note { margin-top: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #999); }
.zmem-link-btn { border: none; background: none; padding: 0; font-size: 12px; color: var(--dsw-alias-brand-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #416ad9)); text-decoration: underline; }
.zmem-link-btn:hover { text-decoration: none; }

/* Switch (radix geometry: 32\xD718 track, 16px thumb) */
.zmem-switch { position: relative; flex: none; width: 32px; height: 18px; padding: 1px; border: none; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #416ad9)) 30%, transparent); transition: background .15s ease; }
.zmem-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #416ad9)); }
.zmem-switch-thumb { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, #fff); transition: transform .15s ease; }
.zmem-switch[aria-checked="true"] .zmem-switch-thumb { transform: translateX(14px); }
.zmem-switch:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #416ad9) 30%, transparent); outline-offset: 2px; }

/* Dashed placeholder (PluginLoadingState / SearchEmptyState / localOnly) */
.zmem-dashed { border: 1px dashed var(--dsw-alias-border-l2, #8886); border-radius: var(--dsw-radius-md, 12px); padding: 32px 16px; text-align: center; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #888); background: transparent; overflow-wrap: anywhere; }

/* Catalog error, styled like the upstream Alert slot */
.zmem-alert-box { border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d64545) 40%, transparent); border-radius: var(--dsw-radius-md, 12px); padding: 12px 16px; font-size: 14px; line-height: 22px; color: var(--dsw-alias-state-error-primary, #d64545); overflow-wrap: anywhere; }

/* Viewer toolbar */
.zmem-viewer { display: grid; gap: 16px; }
.zmem-bar { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.zmem-bar-side { display: flex; min-width: 0; align-items: center; gap: 12px; }
.zmem-bar-end { flex: 1 1 160px; justify-content: flex-end; }
.zmem-bar-divider { width: 1px; height: 16px; flex: none; background: var(--dsw-alias-border-l2, #8886); }
.zmem-count { flex: none; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #888); }

/* Capsule scope trigger + dropdown (PluginScopeMenu) */
.zmem-scope { position: relative; min-width: 0; }
.zmem-scope-trigger { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; height: 36px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2, #8886); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-primary, inherit); font-size: 14px; line-height: 22px; }
.zmem-scope-trigger:hover { background: var(--dsw-alias-interactive-bg-hover, #8881); }
.zmem-scope-trigger svg { flex: none; }
.zmem-scope-trigger svg:last-child { color: var(--dsw-alias-label-tertiary, #999); }
.zmem-scope-label { max-width: 192px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zmem-menu { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; width: 256px; max-width: calc(100vw - 32px); padding: 4px; border: 1px solid var(--dsw-alias-border-l3, #8885); border-radius: var(--dsw-radius-sm, 8px); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #fff)); box-shadow: var(--dsw-elevation-prominent, 0 4px 16px #0002); display: grid; gap: 2px; }
.zmem-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px; border: none; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary, inherit); font-size: 14px; line-height: 22px; text-align: left; }
.zmem-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, #8881); }
.zmem-menu-check { width: 14px; flex: none; display: inline-flex; justify-content: center; color: var(--dsw-alias-brand-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #416ad9)); }
.zmem-menu-item svg { flex: none; }
.zmem-menu-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Search field (SettingsSearchInput: h-9 rounded-xl, icons inside) */
.zmem-searchbox { position: relative; width: 256px; max-width: 100%; }
.zmem-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); display: inline-flex; color: var(--dsw-alias-label-secondary, #888); pointer-events: none; }
.zmem-searchbox input { width: 100%; height: 36px; padding: 0 36px 0 36px; border: 1px solid var(--dsw-alias-border-l2, #8886); border-radius: var(--dsw-radius-md, 12px); background: transparent; color: var(--dsw-alias-label-primary, inherit); font: inherit; font-size: 14px; line-height: 22px; }
.zmem-searchbox input::-webkit-search-cancel-button { appearance: none; }
.zmem-searchbox input:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #416ad9) 30%, transparent); outline-offset: 1px; }
.zmem-search-clear { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary, #888); }
.zmem-search-clear:hover { background: var(--dsw-alias-interactive-bg-hover, #8881); }

/* Files heading + refresh icon button (SettingsResourceHeaderActions) */
.zmem-files-head { min-height: 28px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.zmem-files-head h3 { font-size: 14px; font-weight: 500; line-height: 22px; color: var(--dsw-alias-label-primary, inherit); }
.zmem-icon-btn { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--dsw-alias-border-l2, #8886); border-radius: var(--dsw-radius-sm, 8px); background: transparent; color: var(--dsw-alias-label-primary, inherit); }
.zmem-icon-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #8881); }
.zmem-icon-btn:focus-visible, .zmem-scope-trigger:focus-visible, .zmem-menu-item:focus-visible, .zmem-file:focus-visible, .zmem-search-clear:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #416ad9) 30%, transparent); outline-offset: 1px; }
.zmem-spin { display: inline-flex; animation: zmem-spin 1s linear infinite; }
@keyframes zmem-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .zmem-spin { animation: none; } }

/* File list (rounded-xl bg-surface, hairline dividers, hover rows) */
.zmem-file-list { overflow: hidden; border-radius: var(--dsw-radius-md, 12px); background: color-mix(in srgb, var(--dsw-alias-label-primary, #888) 4%, transparent); }
.zmem-file-divider { height: 1px; background: color-mix(in srgb, var(--dsw-alias-border-l2, #8886) 50%, transparent); }
.zmem-file { display: flex; width: 100%; min-width: 0; align-items: center; gap: 12px; padding: 12px 16px; border: none; background: transparent; text-align: left; }
.zmem-file:hover { background: var(--dsw-alias-interactive-bg-hover, #8881); }
.zmem-file[aria-current="true"] { background: color-mix(in srgb, var(--dsw-alias-brand-primary, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #416ad9)) 8%, transparent); }
.zmem-file-icon { flex: none; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-alias-bg-layer-1, transparent); color: var(--dsw-alias-label-secondary, #888); }
.zmem-file-text { min-width: 0; flex: 1; display: grid; gap: 2px; }
.zmem-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; line-height: 22px; color: var(--dsw-alias-label-primary, inherit); }
.zmem-file-time { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary, #888); }

/* Read-only Markdown preview card (DSH-only: no external editor exists) */
.zmem-preview { overflow: hidden; border: 1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4, #8884)); border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, transparent)); }
.zmem-preview-head { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--dsw-alias-border-l2, #8886); }
.zmem-preview-icon { display: inline-flex; flex: none; color: var(--dsw-alias-label-secondary, #888); }
.zmem-preview-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; line-height: 22px; }
.zmem-preview-badge { flex: none; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #999); }
.zmem-preview-body { padding: 16px; max-height: 650px; overflow: auto; }
.zmem-preview-state { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-secondary, #888); text-align: center; padding: 16px 0; }
.zmem-preview-error { color: var(--dsw-alias-state-error-primary, #d64545); }

/* Markdown body, following ZCode DESIGN.md typography roles */
.zmem-markdown { font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }
.zmem-markdown > * + * { margin-top: 12px; }
.zmem-markdown h1 { font-size: 18px; font-weight: 600; line-height: 1.4; }
.zmem-markdown h2 { font-size: 16px; font-weight: 600; line-height: 1.4; }
.zmem-markdown h3, .zmem-markdown h4 { font-size: 14px; font-weight: 600; }
.zmem-markdown h5 { font-size: 14px; font-weight: 500; }
.zmem-markdown h6 { font-size: 14px; font-weight: 400; }
.zmem-markdown pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 10px 12px; margin: 10px 0; border-radius: var(--dsw-radius-sm, 8px); background: color-mix(in srgb, var(--dsw-alias-label-primary, #888) 6%, transparent); font-size: 12px; }
.zmem-markdown code { font-family: var(--ds-font-family-code, ui-monospace, Consolas, monospace); font-size: 12px; }
.zmem-markdown blockquote { margin-left: 0; padding-left: 12px; border-left: 3px solid var(--dsw-alias-border-l2, #8886); color: var(--dsw-alias-label-secondary, #888); }
.zmem-markdown ul, .zmem-markdown ol { padding-left: 22px; }
.zmem-markdown hr { border: none; border-top: 1px solid var(--dsw-alias-border-l2, #8886); }
.zmem-table { overflow-x: auto; }
.zmem-markdown table { border-collapse: collapse; }
.zmem-markdown th, .zmem-markdown td { border: 1px solid var(--dsw-alias-border-l2, #8886); padding: 5px 8px; }
.zmem-link { text-decoration: underline dotted; }
.zmem-frontmatter { color: var(--dsw-alias-label-secondary, #888); }

@media (max-width: 640px) {
  .zmem-bar { align-items: stretch; }
  .zmem-bar-end { flex-basis: 100%; }
  .zmem-searchbox { width: 100%; }
}
`;

// src/client/view.js
function svg(children, size = 16) {
  return (0, import_react2.createElement)("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false"
  }, children);
}
var IconFolder = () => svg((0, import_react2.createElement)("path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }));
var IconChevronDown = () => svg((0, import_react2.createElement)("path", { d: "m6 9 6 6 6-6" }));
var IconSearch = () => svg([(0, import_react2.createElement)("circle", { key: "c", cx: 11, cy: 11, r: 8 }), (0, import_react2.createElement)("path", { key: "p", d: "m21 21-4.34-4.34" })]);
var IconX = () => svg([(0, import_react2.createElement)("path", { key: "a", d: "M18 6 6 18" }), (0, import_react2.createElement)("path", { key: "b", d: "m6 6 12 12" })], 14);
var IconRefresh = () => svg([
  (0, import_react2.createElement)("path", { key: "a", d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }),
  (0, import_react2.createElement)("path", { key: "b", d: "M21 3v5h-5" }),
  (0, import_react2.createElement)("path", { key: "c", d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }),
  (0, import_react2.createElement)("path", { key: "d", d: "M8 16H3v5" })
]);
var IconSpinner = () => svg((0, import_react2.createElement)("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }));
var IconFile = () => svg([
  (0, import_react2.createElement)("path", { key: "a", d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }),
  (0, import_react2.createElement)("path", { key: "b", d: "M14 2v4a2 2 0 0 0 2 2h4" }),
  (0, import_react2.createElement)("path", { key: "c", d: "M10 9H8" }),
  (0, import_react2.createElement)("path", { key: "d", d: "M16 13H8" }),
  (0, import_react2.createElement)("path", { key: "e", d: "M16 17H8" })
]);
var IconCheck = () => svg((0, import_react2.createElement)("path", { d: "M20 6 9 17l-5-5" }), 14);
function currentLang() {
  try {
    return String(globalThis.document?.documentElement?.lang ?? "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "zh";
  }
}
function dashed(message, label = "\u8BB0\u5FC6\u72B6\u6001\u63D0\u793A") {
  return (0, import_react2.createElement)("div", { className: "zmem-dashed", role: "status", "aria-label": label }, message);
}
function ScopeMenu({ workspaces, selectedId, onChange }) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const rootRef = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    if (!open) return void 0;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  const selected = workspaces.find((item) => item.id === selectedId);
  return (0, import_react2.createElement)(
    "div",
    { className: "zmem-scope", ref: rootRef },
    (0, import_react2.createElement)(
      "button",
      {
        type: "button",
        className: "zmem-scope-trigger",
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-label": "\u9009\u62E9\u8BB0\u5FC6\u5DE5\u4F5C\u533A",
        onClick: () => setOpen((value) => !value)
      },
      (0, import_react2.createElement)(IconFolder),
      (0, import_react2.createElement)("span", { className: "zmem-scope-label" }, selected?.label ?? ""),
      (0, import_react2.createElement)(IconChevronDown)
    ),
    open ? (0, import_react2.createElement)(
      "div",
      { className: "zmem-menu", role: "menu", "aria-label": "\u5DE5\u4F5C\u533A" },
      workspaces.map((item) => (0, import_react2.createElement)(
        "button",
        {
          type: "button",
          key: item.id,
          role: "menuitemradio",
          "aria-checked": item.id === selectedId,
          className: "zmem-menu-item",
          onClick: () => {
            setOpen(false);
            onChange(item.id);
          }
        },
        (0, import_react2.createElement)("span", { className: "zmem-menu-check", "aria-hidden": "true" }, item.id === selectedId ? (0, import_react2.createElement)(IconCheck) : null),
        (0, import_react2.createElement)(IconFolder),
        (0, import_react2.createElement)("span", { className: "zmem-menu-label" }, item.label)
      ))
    ) : null
  );
}
function FileList({ model, state, files, now }) {
  const lang = currentLang();
  const rows = [];
  files.forEach((file, index) => {
    if (index > 0) rows.push((0, import_react2.createElement)("div", { key: `gap-${file.name}`, className: "zmem-file-divider", "aria-hidden": "true" }));
    rows.push((0, import_react2.createElement)(
      "button",
      {
        type: "button",
        key: file.name,
        className: "zmem-file",
        "aria-current": state.fileName === file.name ? "true" : void 0,
        onClick: () => {
          void model.selectFile(file.name);
        }
      },
      (0, import_react2.createElement)("span", { className: "zmem-file-icon", "aria-hidden": "true" }, (0, import_react2.createElement)(IconFile)),
      (0, import_react2.createElement)(
        "span",
        { className: "zmem-file-text" },
        (0, import_react2.createElement)("span", { className: "zmem-file-name" }, file.name),
        (0, import_react2.createElement)("span", { className: "zmem-file-time" }, formatMemoryUpdatedAt({ now, updatedAt: file.updatedAt, lang }))
      )
    ));
  });
  return (0, import_react2.createElement)("div", { className: "zmem-file-list", "aria-label": "\u8BB0\u5FC6\u6587\u4EF6" }, rows);
}
function PreviewPane({ state }) {
  return (0, import_react2.createElement)(
    "section",
    { className: "zmem-preview", "aria-label": "\u8BB0\u5FC6\u6587\u4EF6\u53EA\u8BFB\u9884\u89C8" },
    (0, import_react2.createElement)(
      "header",
      { className: "zmem-preview-head" },
      (0, import_react2.createElement)("span", { className: "zmem-preview-icon", "aria-hidden": "true" }, (0, import_react2.createElement)(IconFile)),
      (0, import_react2.createElement)("strong", { className: "zmem-preview-name" }, state.fileName ?? ""),
      (0, import_react2.createElement)("span", { className: "zmem-preview-badge" }, "\u53EA\u8BFB")
    ),
    (0, import_react2.createElement)(
      "div",
      { className: "zmem-preview-body", "aria-busy": state.previewStatus === "loading" },
      state.previewStatus === "loading" ? (0, import_react2.createElement)("p", { className: "zmem-preview-state" }, "\u6B63\u5728\u52A0\u8F7D\u6587\u4EF6\u2026") : state.previewStatus === "error" ? (0, import_react2.createElement)("p", { className: "zmem-preview-state zmem-preview-error", role: "alert" }, state.previewError) : state.previewStatus === "ready" && state.preview ? (0, import_react2.createElement)(MarkdownPreview, { content: state.preview.content }) : (0, import_react2.createElement)("p", { className: "zmem-preview-state" }, "\u9009\u62E9\u4E00\u4E2A\u8BB0\u5FC6\u6587\u4EF6\u4EE5\u67E5\u770B\u5185\u5BB9\u3002")
    )
  );
}
function MemoryPage({ api }) {
  const [model] = (0, import_react2.useState)(() => new MemoryModel(api));
  const state = (0, import_react2.useSyncExternalStore)(model.subscribe, model.getSnapshot, model.getSnapshot);
  const [now, setNow] = (0, import_react2.useState)(() => Date.now());
  (0, import_react2.useEffect)(() => {
    void model.start();
    const interval = setInterval(() => setNow(Date.now()), 6e4);
    return () => {
      clearInterval(interval);
      model.dispose();
    };
  }, [model]);
  return (0, import_react2.createElement)(MemoryView, { model, state, now });
}
function MemoryView({ model, state, now }) {
  const currentTime = typeof now === "number" ? now : Date.now();
  const rawMode = viewerMode(state);
  const mode = rawMode === "loading" && state.workspaces.length > 0 ? "ready" : rawMode;
  const workspace = state.workspaces.find((item) => item.id === state.workspaceId);
  const visibleFiles = filterFiles(workspace?.files ?? [], state.query);
  const refreshing = state.catalogStatus === "loading";
  const busy = state.saving || refreshing;
  const loadingSettings = state.settingsStatus === "idle" || state.settingsStatus === "loading";
  const failedSettings = state.settingsStatus === "error";
  const readOnlySettings = state.settingsStatus === "ready" && state.settings.writable === false;
  const switchDisabled = state.saving || state.settingsStatus !== "ready" || readOnlySettings;
  const switchText = state.saving ? "\u4FDD\u5B58\u4E2D\u2026" : loadingSettings ? "\u8BFB\u53D6\u8BBE\u7F6E\u2026" : failedSettings ? "\u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25" : state.settings.enabled ? "\u5173\u95ED\u5DE5\u4F5C\u533A\u8BB0\u5FC6" : "\u5F00\u542F\u5DE5\u4F5C\u533A\u8BB0\u5FC6";
  let viewer = null;
  if (failedSettings) viewer = null;
  else if (mode === "loading") viewer = dashed("\u6B63\u5728\u52A0\u8F7D\u8BB0\u5FC6\u2026");
  else if (mode === "remote") viewer = dashed(REMOTE_NOTICE);
  else if (mode === "disabled") viewer = null;
  else if (mode === "error") viewer = (0, import_react2.createElement)("div", { className: "zmem-alert-box", role: "alert" }, state.catalogError ?? "\u65E0\u6CD5\u8BFB\u53D6\u8BB0\u5FC6\uFF0C\u8BF7\u663E\u5F0F\u5237\u65B0\u540E\u91CD\u8BD5\u3002");
  else if (mode === "empty") viewer = dashed("\u6682\u65E0\u5DF2\u4FDD\u5B58\u7684\u5DE5\u4F5C\u533A\u8BB0\u5FC6");
  else {
    const searchEmpty = Boolean(state.query.trim()) && visibleFiles.length === 0;
    viewer = (0, import_react2.createElement)(
      "section",
      { className: "zmem-viewer", "aria-label": "\u672C\u5730\u5DE5\u4F5C\u533A\u8BB0\u5FC6\u6D4F\u89C8\u5668" },
      (0, import_react2.createElement)(
        "div",
        { className: "zmem-bar" },
        (0, import_react2.createElement)(
          "div",
          { className: "zmem-bar-side" },
          (0, import_react2.createElement)(ScopeMenu, {
            workspaces: state.workspaces,
            selectedId: state.workspaceId,
            onChange: (id) => {
              void model.selectWorkspace(id);
            }
          }),
          (0, import_react2.createElement)("span", { className: "zmem-bar-divider", "aria-hidden": "true" }),
          (0, import_react2.createElement)("span", { className: "zmem-count", role: "status" }, `${workspace?.files.length ?? 0} \u6761\u8BB0\u5FC6`)
        ),
        (0, import_react2.createElement)(
          "div",
          { className: "zmem-bar-side zmem-bar-end" },
          (0, import_react2.createElement)(
            "div",
            { className: "zmem-searchbox" },
            (0, import_react2.createElement)("span", { className: "zmem-search-icon", "aria-hidden": "true" }, (0, import_react2.createElement)(IconSearch)),
            (0, import_react2.createElement)("input", {
              type: "search",
              value: state.query,
              placeholder: "\u641C\u7D22\u8BB0\u5FC6\u6587\u4EF6\u2026",
              "aria-label": "\u641C\u7D22\u8BB0\u5FC6\u6587\u4EF6",
              onChange: (event) => model.setQuery(event.target.value)
            }),
            state.query ? (0, import_react2.createElement)("button", {
              type: "button",
              className: "zmem-search-clear",
              "aria-label": "\u6E05\u7A7A\u641C\u7D22",
              onClick: () => model.setQuery("")
            }, (0, import_react2.createElement)(IconX)) : null
          )
        )
      ),
      searchEmpty ? dashed("\u6CA1\u6709\u5339\u914D\u7684\u8BB0\u5FC6\u6587\u4EF6\u3002", "\u641C\u7D22\u8BB0\u5FC6\u6587\u4EF6\u7ED3\u679C") : (0, import_react2.createElement)(
        import_react2.Fragment,
        null,
        (0, import_react2.createElement)(
          "div",
          { className: "zmem-files-head" },
          (0, import_react2.createElement)("h3", null, "\u6587\u4EF6"),
          (0, import_react2.createElement)("button", {
            type: "button",
            className: "zmem-icon-btn",
            "aria-label": "\u5237\u65B0",
            title: "\u5237\u65B0",
            disabled: busy,
            onClick: () => {
              void model.refresh();
            }
          }, (0, import_react2.createElement)(
            "span",
            { className: refreshing ? "zmem-spin" : void 0 },
            refreshing ? (0, import_react2.createElement)(IconSpinner) : (0, import_react2.createElement)(IconRefresh)
          ))
        ),
        (0, import_react2.createElement)(FileList, { model, state, files: visibleFiles, now: currentTime })
      ),
      state.fileName ? (0, import_react2.createElement)(PreviewPane, { state }) : null
    );
  }
  return (0, import_react2.createElement)(
    "div",
    { className: "zmem", "data-zcode-memory-unified": true },
    (0, import_react2.createElement)("style", null, styles),
    (0, import_react2.createElement)(
      "section",
      { className: "zmem-card", "aria-label": "\u5DE5\u4F5C\u533A\u8BB0\u5FC6\u8BBE\u7F6E" },
      (0, import_react2.createElement)(
        "div",
        { className: "zmem-row" },
        (0, import_react2.createElement)(
          "div",
          { className: "zmem-row-text" },
          (0, import_react2.createElement)("div", { className: "zmem-row-title" }, "\u5DE5\u4F5C\u533A\u8BB0\u5FC6"),
          (0, import_react2.createElement)("div", { className: "zmem-row-desc" }, SETTINGS_NOTICE),
          (0, import_react2.createElement)("div", { className: "zmem-row-note" }, PROVIDER_NOTICE),
          failedSettings ? (0, import_react2.createElement)(
            "div",
            { className: "zmem-inline-alert", role: "alert" },
            `\u8BBE\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF1A${state.settingsError ?? "\u8BF7\u91CD\u8BD5"}`,
            (0, import_react2.createElement)("button", {
              type: "button",
              className: "zmem-link-btn",
              "aria-label": "\u91CD\u65B0\u8BFB\u53D6\u8BB0\u5FC6\u8BBE\u7F6E",
              onClick: () => {
                void model.refresh();
              }
            }, "\u91CD\u65B0\u8BFB\u53D6\u8BBE\u7F6E")
          ) : null,
          readOnlySettings ? (0, import_react2.createElement)(
            "div",
            { className: "zmem-inline-note" },
            "\u5F53\u524D DSH \u914D\u7F6E\u4E3A\u53EA\u8BFB\uFF0C\u4E0D\u80FD\u66F4\u6539\u8BB0\u5FC6\u5F00\u5173\uFF1B\u5DF2\u6709\u8BB0\u5FC6\u4ECD\u53EF\u6309\u6743\u9650\u6D4F\u89C8\u3002"
          ) : null,
          state.saveError ? (0, import_react2.createElement)(
            "div",
            { className: "zmem-inline-alert", role: "alert" },
            `\u8BBE\u7F6E\u672A\u4FDD\u5B58\uFF1A${state.saveError}`
          ) : null
        ),
        (0, import_react2.createElement)(
          "button",
          {
            type: "button",
            role: "switch",
            className: "zmem-switch",
            "aria-label": "\u5DE5\u4F5C\u533A\u8BB0\u5FC6",
            "aria-checked": state.settings.enabled,
            disabled: switchDisabled,
            onClick: () => {
              void model.setEnabled(!state.settings.enabled);
            }
          },
          (0, import_react2.createElement)("span", { className: "zmem-switch-thumb", "aria-hidden": "true" }),
          (0, import_react2.createElement)("span", { className: "zmem-sr-only" }, switchText)
        )
      )
    ),
    viewer
  );
}
function MemoryConfig({ view, api }) {
  return view === "summary" ? "ZCode \u98CE\u683C\u7684\u5DE5\u4F5C\u533A\u8BB0\u5FC6\uFF1A\u9ED8\u8BA4\u5173\u95ED\u3001\u6309\u4F1A\u8BDD\u751F\u6548\u3001\u672C\u5730\u6587\u4EF6\u53EA\u8BFB\u6D4F\u89C8\u3002" : (0, import_react2.createElement)(MemoryPage, { api });
}

// src/client/api.js
var BASE = "/api/zcode-memory-unified";
var invalid = () => new MemoryClientError("INVALID_RESPONSE", "Invalid memory API response");
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var timestamp = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
function decodeSettings(value) {
  if (!isRecord(value) || typeof value.enabled !== "boolean" || typeof value.local !== "boolean" || value.sessionScoped !== true || value.branch !== "default-index") throw invalid();
  return { enabled: value.enabled, local: value.local, sessionScoped: true, branch: "default-index" };
}
function decodeCatalog(value) {
  if (!isRecord(value) || !Array.isArray(value.workspaces)) throw invalid();
  const ids = /* @__PURE__ */ new Set();
  const workspaces = value.workspaces.map((workspace) => {
    if (!isRecord(workspace) || typeof workspace.id !== "string" || !workspace.id || ids.has(workspace.id) || typeof workspace.label !== "string" || !timestamp(workspace.updatedAt) || !Array.isArray(workspace.files)) throw invalid();
    ids.add(workspace.id);
    const names = /* @__PURE__ */ new Set();
    const files = workspace.files.map((file) => {
      if (!isRecord(file) || typeof file.name !== "string" || !file.name || names.has(file.name.toLowerCase()) || /[\\/\u0000-\u001f]/u.test(file.name) || file.name === "." || file.name === ".." || !["index", "item"].includes(file.kind) || !Number.isSafeInteger(file.size) || file.size < 0 || !timestamp(file.updatedAt)) throw invalid();
      names.add(file.name.toLowerCase());
      return { name: file.name, kind: file.kind, size: file.size, updatedAt: file.updatedAt };
    });
    return { id: workspace.id, label: workspace.label, updatedAt: workspace.updatedAt, files };
  });
  return { workspaces };
}
function decodePreview(value) {
  if (!isRecord(value) || typeof value.content !== "string" || !timestamp(value.updatedAt)) throw invalid();
  return { content: value.content, updatedAt: value.updatedAt };
}
function createMemoryRpcApi(rpc) {
  if (typeof rpc?.call !== "function") throw new TypeError("A DSH Connection RPC caller is required");
  async function request(endpoint, payload, decode, signal) {
    signal?.throwIfAborted();
    const result = await rpc.call("/api", `zcode-memory-unified/${endpoint}`, payload, signal);
    signal?.throwIfAborted();
    if (!isRecord(result) || typeof result.ok !== "boolean") throw invalid();
    if (!result.ok) {
      if (!isRecord(result.error) || typeof result.error.code !== "string" || typeof result.error.message !== "string") throw invalid();
      throw new MemoryClientError(result.error.code, result.error.message);
    }
    return decode(result.value);
  }
  return {
    getSettings: (signal) => request("settings", {}, decodeSettings, signal),
    setSettings: ({ enabled }, signal) => {
      if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean");
      return request("settings", { enabled }, decodeSettings, signal);
    },
    getWorkspaces: (signal) => request("workspaces", {}, decodeCatalog, signal),
    getFile: (workspaceId, fileName, signal) => request("file", { workspaceId, fileName }, decodePreview, signal)
  };
}
function createMemoryApi(authorizedFetch) {
  if (typeof authorizedFetch !== "function") throw new TypeError("A DSH authorized transport is required");
  async function request(path, init, decode) {
    const response = await authorizedFetch(`${BASE}${path}`, { ...init, cache: "no-store" });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new MemoryClientError(response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : "INVALID_RESPONSE", "Invalid memory API response");
    }
    if (!response.ok) {
      const error = isRecord(data) && isRecord(data.error) ? data.error : null;
      throw new MemoryClientError(
        error?.code ?? (response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : "REQUEST_FAILED"),
        typeof error?.message === "string" ? error.message : `Memory API request failed (${response.status})`
      );
    }
    return decode(data);
  }
  return {
    getSettings: (signal) => request("/settings", { signal }, decodeSettings),
    setSettings: ({ enabled }, signal) => {
      if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean");
      return request("/settings", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }, decodeSettings);
    },
    getWorkspaces: (signal) => request("/workspaces", { signal }, decodeCatalog),
    getFile: (workspaceId, fileName, signal) => request(`/file?${new URLSearchParams({ workspaceId, fileName })}`, { signal }, decodePreview)
  };
}

// src/client/transport.js
var ALLOWED_PATH = /^\/api\/zcode-memory-unified\/(?:settings|workspaces|file)(?:\?|$)/u;
function createAuthorizedFetch(environment = globalThis) {
  return (path, init = {}) => {
    if (!ALLOWED_PATH.test(path)) throw new MemoryClientError("INVALID_PATH", "Unexpected memory API target");
    const relativePath = path.slice(1);
    const transport = environment.__DSH_TRANSPORT__;
    if (transport !== void 0) {
      if (typeof transport?.fetch !== "function") throw new MemoryClientError("TRANSPORT_UNAVAILABLE", "\u8BB0\u5FC6\u754C\u9762\u65E0\u6CD5\u4F7F\u7528\u5F53\u524DDSH\u8FDE\u63A5\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u6216\u91CD\u542FDSH\u540E\u91CD\u8BD5\u3002");
      return transport.fetch(relativePath, { ...init, credentials: "same-origin", redirect: "error" });
    }
    if (!["http:", "https:"].includes(environment.location?.protocol) || typeof environment.fetch !== "function") {
      throw new MemoryClientError("TRANSPORT_UNAVAILABLE", "\u5F53\u524D\u73AF\u5883\u6CA1\u6709\u53EF\u7528\u7684 DSH \u5DF2\u6388\u6743\u4F20\u8F93\u3002");
    }
    return environment.fetch(relativePath, { ...init, mode: "same-origin", credentials: "same-origin", redirect: "error" });
  };
}
function createDshMemoryApi(connection, environment = globalThis) {
  const api = typeof connection.rpc?.call === "function" ? createMemoryRpcApi(connection.rpc) : createMemoryApi(createAuthorizedFetch(environment));
  const localSettings = (settings) => ({ ...settings, local: settings.local && connection.isLoopback === true });
  const assertLocal = () => {
    if (connection.isLoopback !== true) throw new MemoryClientError("LOCAL_ONLY", "Remote catalog access is disabled");
  };
  return {
    getSettings: async (signal) => localSettings(await api.getSettings(signal)),
    setSettings: async (value, signal) => localSettings(await api.setSettings(value, signal)),
    getWorkspaces: (signal) => {
      assertLocal();
      return api.getWorkspaces(signal);
    },
    getFile: (id, name, signal) => {
      assertLocal();
      return api.getFile(id, name, signal);
    }
  };
}

// src/client/native-settings.js
function waitForShared(promise, signal) {
  signal?.throwIfAborted();
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then((value) => {
      cleanup();
      resolve(value);
    }, (error) => {
      cleanup();
      reject(error);
    });
  });
}
function createNativeMemoryApi(connection, configForms, environment = globalThis) {
  if (!configForms?.get || !configForms?.describe) throw new TypeError("Native DSH ConfigForms is required");
  const form = configForms.get("zcode-memory-unified");
  const mirror = configForms.describe();
  const files = createDshMemoryApi(connection, environment);
  function accepted() {
    const snapshot = form.getSnapshot();
    if (snapshot.status !== "ready" || typeof snapshot.value?.enabled !== "boolean") {
      throw new MemoryClientError("SETTINGS_UNAVAILABLE", "\u8BB0\u5FC6\u8BBE\u7F6E\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u786E\u8BA4\u63D2\u4EF6\u7EC4\u5408\u5305\u5DF2\u542F\u7528\u540E\u91CD\u8BD5\u3002");
    }
    return { enabled: snapshot.value.enabled, local: connection.isLoopback === true, sessionScoped: true, branch: "default-index", writable: snapshot.writable === true };
  }
  return {
    async getSettings(signal) {
      signal?.throwIfAborted();
      await waitForShared(mirror.load(), signal);
      signal?.throwIfAborted();
      const error = mirror.getSnapshot().error;
      if (error) throw new MemoryClientError("SETTINGS_READ_FAILED", String(error));
      return accepted();
    },
    async setSettings({ enabled }, signal) {
      if (typeof enabled !== "boolean") throw new TypeError("enabled must be a boolean");
      signal?.throwIfAborted();
      if (!accepted().writable) throw new MemoryClientError("SETTINGS_READ_ONLY", "\u5F53\u524DDSH\u8BBE\u7F6E\u662F\u53EA\u8BFB\u7684\uFF0C\u65E0\u6CD5\u66F4\u6539\u5DE5\u4F5C\u533A\u8BB0\u5FC6\u5F00\u5173\u3002");
      const saved = await waitForShared(form.set("enabled", enabled), signal);
      signal?.throwIfAborted();
      if (saved !== true) throw new MemoryClientError("SETTINGS_WRITE_FAILED", "DSH\u6CA1\u6709\u63A5\u53D7\u6B64\u6B21\u4FEE\u6539\uFF0C\u539F\u8BBE\u7F6E\u4FDD\u6301\u4E0D\u53D8\uFF1B\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002");
      const settings = accepted();
      if (settings.enabled !== enabled) throw new MemoryClientError("SETTINGS_WRITE_FAILED", "\u8BBE\u7F6E\u5C1A\u672A\u786E\u8BA4\u751F\u6548\uFF0C\u8BF7\u5237\u65B0\u540E\u6838\u5BF9\u3002");
      return settings;
    },
    getWorkspaces: files.getWorkspaces,
    getFile: files.getFile
  };
}

// src/client/index.js
var inject = ["slots", "connection", "locale", "configForms"];
var PACKAGE_NAME = "@local/zcode-memory-dsh";
var NS = "settings.zcodeMemory";
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: { nav: "\u5DE5\u4F5C\u533A\u8BB0\u5FC6" }, en: { nav: "Workspace Memory" } }), "memory settings locale");
  const t = ctx.locale.bind(NS);
  const api = createNativeMemoryApi(ctx.connection, ctx.configForms);
  function BoundMemoryConfig(props) {
    return (0, import_react3.createElement)(MemoryConfig, { ...props, api });
  }
  function MemorySettings(props) {
    return (0, import_react3.createElement)(MemoryConfig, { ...props, view: "page", api });
  }
  ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
    name: "plugins.bundle.config",
    key: PACKAGE_NAME
  }, BoundMemoryConfig));
  ctx.effect(() => ctx.configForms.whileServed(["zcode-memory-unified"], () => ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "zcode-memory-unified",
    order: 40,
    label: () => t("nav"),
    locale: NS
  }, MemorySettings))), "memory settings section");
}

return module.exports;}});
