# ZCode Memory for Pi CLI

Install the complete root package through Pi's native package manager; its `pi.extensions` declaration loads the adapter persistently:

```sh
pi install git:github.com/Rogers-F/zcode-memory
pi list
pi config   # uncheck/check this package's resources to disable/enable
pi update git:github.com/Rogers-F/zcode-memory
pi remove git:github.com/Rogers-F/zcode-memory
```

Restart/reload Pi after resource changes. `pi config` is the native resource selector. For scripted management the root CLI also provides `zcode-memory host enable|disable|status --host pi-cli --source <exact-source-from-pi-list>`; it atomically saves/restores the package's official extensions/skills/prompts/themes filters with private backups and recovery. It does not edit other packages. Native updates retain those filters and memory settings; remove leaves memory intact. The moving Git source receives explicit `pi update`; pinned Git refs do not advance automatically. No temporary extension flag is needed.

The adapter registers twelve memory tools and the `/memory` command. The real order is before_agent_start then context: selection runs before the agent, and every context request replays a bounded index and the session's still-valid selected bodies, including tool continuations and later turns. This output is transient and never writes a durable once-only receipt. Repeated queries reuse selection/body caches; revisions and forget remove stale entries before the next request. session_compact resets the working set and rebuilds the index on the next request. Completed settlement schedules opt-in extraction. Aborted and failed activities do not extract. The default extraction model is local durable-sentence screening; no external account is discovered.

Pi 1.4.0 has been exercised with the actual CLI and same-process RPC turns using a test-only scripted provider in an isolated HOME. Event capture verifies before_agent_start -> context twice, plus a native forget tool continuation; get_messages confirms the context snippets never entered history. The default path with unset `ZCODE_MEMORY_HOME` and no --home is also tested: temporary HOME/.zcode-memory/hosts/pi-cli. Set `ZCODE_MEMORY_PI_MCP=1` to additionally use the current native registerMcpServer API with the same local server; ordinary users can rely on native tools without duplicate MCP exposure. Set `ZCODE_MEMORY_READ_ONLY=1` for rejected memory mutations. Automatic extraction defaults off. Agent scopes are available through tools but subagent automation is not promised. Semantic recall stays local without an explicitly provided model.recall bridge and never searches credentials. Shared user/feedback preferences are personal across projects; write operations invalidate prior attachments. The unified root README documents the capability matrix, budgets, migration, storage protocol and licenses.
