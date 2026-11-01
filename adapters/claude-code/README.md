# ZCode Memory for Claude Code CLI

Host-isolated Markdown memory with twelve MCP tools and opt-in lifecycle hooks. v0.3.1 supplies a native Git marketplace and a complete, version-controlled root plugin: `bin/`, `src/` and licensed YAML fallback are present in Git, independent of ignored build output.

```sh
claude plugin marketplace add Rogers-F/zcode-memory
claude plugin install zcode-memory@zcode-memory --scope user
claude plugin list
claude plugin disable zcode-memory@zcode-memory --scope user
claude plugin enable zcode-memory@zcode-memory --scope user
# Explicitly confirm updating; restart sessions after changes.
claude plugin marketplace update zcode-memory
claude plugin update zcode-memory@zcode-memory --scope user
claude plugin uninstall zcode-memory@zcode-memory --scope user
```

Install enables the plugin persistently. Native disable stops plugin MCP/hooks in subsequent sessions; enable restores them. Update/uninstall retain independently stored facts and memory settings. Review host trust and permission prompts normally. The generated `.tgz` is also a complete offline runtime, but the source adapter directory alone is a template. No test changes your real profile. Release URLs/marketplace versions become available only after the maintainer publishes v0.3.1.

SessionStart injects a bounded index at most once per session/revision until compaction. Durable receipts dedupe new hook processes and resume because hook content stays in the transcript. Index receipts are separate from body receipts: a later relevant query can still fetch complete bodies. SessionStart with source=compact resets receipts/budgets and reinjects the necessary index; a subsequent query may supply bodies again. Ordinary zero-match queries write zero stdout bytes. UserPromptSubmit adds budgeted relevant memory and records stable pending prompts only when extraction is enabled. Stop processes completed transcript deltas or the captured prompt fallback. Interrupt/failure/subagent events are not advertised as automatic extraction. Hook permissions and MCP trust belong to Claude; bare mode and disabled hooks reduce functionality to manual MCP tools. Automatic extraction and external model inference default off. No model or credential discovery occurs in this server.

Claude 2.1.316 validates the generated manifest; actual MCP subprocess and hook handler tests run with isolated data. A real Claude model session has not been verified. Existing facts stay within this host namespace, and export/import copies snapshots instead of opening shared writes. See the unified root README for installation, budgets, migration and the actual capability matrix. See LICENSE and NOTICE.md for sources and attribution.
