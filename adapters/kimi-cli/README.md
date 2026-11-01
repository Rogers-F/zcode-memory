# Kimi CLI adapter — v0.3.0

Use Kimi's native user-level plugin manager with the published versioned Release URL:

```text
/plugins install https://github.com/Rogers-F/zcode-memory/releases/download/v0.3.0/zcode-memory-kimi-cli-0.3.0.zip
/plugins list
/plugins disable zcode-memory
/plugins enable zcode-memory
/plugins info zcode-memory
/reload
# or start /new
```

To update, choose Update in the native `/plugins` manager (the catalog at `https://raw.githubusercontent.com/Rogers-F/zcode-memory/main/marketplaces/kimi.json` advertises the current version), or explicitly install the next versioned Release URL. Reinstalling the same ID updates its managed copy and preserves enabled/capability choices. `/plugins remove zcode-memory` removes the plugin, retaining independent facts/settings. Apply enable/disable/update with `/reload` or `/new`; disabled plugins supply no MCP/hooks or instructions to new sessions. Native permissions and hook opt-in remain under user control. These release assets are not published by local builds.

Offline fallback: build with `npm run pack` and install the complete `dist/kimi-cli` directory. For a local ZIP, first unpack it in a terminal, then pass the extracted directory
to Kimi (local plugin installation accepts directories):

```sh
unzip /absolute/zcode-memory/artifacts/zcode-memory-kimi-cli-0.3.0.zip -d /absolute/kimi-memory-plugin
```

```text
/plugins install /absolute/kimi-memory-plugin
/reload
```

The ZIP remains a distribution package for GitHub or HTTP(S) URLs; it is not a
local-file installation target. No ZIP or repository URL is published by builds.

Plugins are user-level. Review plugin code and the host's permissions before
enabling MCP/hooks. MCP tools become available after reload or in new sessions.
The repository root and this source adapter directory are not complete install
targets: the built directory/ZIP includes bin, shared src and yaml for offline use.
Node >=22.19 must be on PATH. No account, provider or credentials are searched.

`kimi.plugin.json` declares 12 real MCP tools, system instructions, a
`/zcode-memory:memory` prompt command and flat hook rules. Every MCP tool requires
an absolute `project` argument to bind the current session workspace: plugin
stdio cwd is the plugin root. Missing/relative project fails closed, rather than
mixing different projects. Hooks bind the official stdin `cwd` to the same space.
Defaults: `~/.zcode-memory/hosts/kimi-cli/`; user/feedback preferences use personal
scope, project/reference and agent scopes remain isolated. The default project
setting inherits explicit personal configuration.

SessionStart startup/resume is observation-only and emits nothing. The first
UserPromptSubmit emits a bounded index plus relevant bodies as plain text. Later
hook processes use persistent transcript receipts and cumulative budgets; an
index receipt never claims a body. PostCompact resets receipts; injection resumes
on the next prompt, never through the observer's stdout. Resume alone does not
reset. Forget/revision changes invalidate future retrieval, but cannot erase
memory already stored in the host transcript; use host context reset as needed.

Automatic extraction defaults off. `memory_settings` with `autoExtract:true`
enables local rule extraction of captured stable user prompts at successful Stop.
Only our UserPromptSubmit input is used, not untrusted transcripts/tool output.
Its `prompt` may be a string or a content-part array. Only explicit text chunks
are read; adjacent text is joined, non-text parts form boundaries, and tools,
attachments and source-marked synthetic content are ignored. TurnStarted is
observation-only and Stop never interprets its own prompt field as new user input.
Interrupt/StopFailure/SessionEnd discard pending input. Hook timeout/crash is
fail-open; journal recovery and content hashes make retries idempotent, but hook
delivery is not an exactly-once acknowledgement from the host. With only hooks disabled, enabled MCP remains manual; disabling the whole plugin removes its MCP, hooks and instructions after reload. No subagent automatic extraction is claimed.

Semantic recall is independently off. Without an explicit model.recall bridge,
`semanticAvailable:false`; this adapter does not reuse Kimi's logged-in model.
Default local BM25/rules incur no inference fee. A custom explicit bridge can
send query/memory to its provider and incur fees: local storage is not local inference.

Official contracts: [plugins](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html),
[hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html),
[MCP](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html).
Native checks use isolated HOME/KIMI_CODE_HOME and no model invocation; see the
root README and verification evidence for the measured scope and limitations.
Installed Kimi 2.4.1 passes version/help and ACP initialize. Standard isolated ACP session/new requires authentication, and ACP does not expose `/plugins`. The separate lifecycle check drives the native TUI with a synthetic unused provider and explicitly confirms our own fixture's normal trust dialog. This sandbox's unmodified fs.watch returns EMFILE; when needed the checker records that failure and uses a test-only watcher stub for manager checks. That proves manager persistence, not normal filesystem watching or native model/hook execution. No real credentials are loaded. HTTPS release downloads remain a publication/network boundary.
