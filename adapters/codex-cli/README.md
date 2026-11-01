# ZCode Memory for Codex CLI

A local MCP server with Markdown facts, guarded writes, revisions, BM25 retrieval, migration, AGENTS.md guidance and native plugin skills/hooks. v0.3.0 provides `.agents/plugins/marketplace.json` and a complete Git plugin root with offline YAML; it does not depend on ignored dist output.

```sh
codex plugin marketplace add Rogers-F/zcode-memory
codex plugin add zcode-memory@zcode-memory
codex plugin list --marketplace zcode-memory
# Install the small persistent toggle/update bridge once, after release publication:
npm install -g https://github.com/Rogers-F/zcode-memory/releases/download/v0.3.0/zcode-memory-0.3.0.tgz
zcode-memory host disable --host codex-cli
zcode-memory host enable --host codex-cli
zcode-memory host status --host codex-cli
zcode-memory host update --host codex-cli
codex plugin remove zcode-memory@zcode-memory
```

Codex 0.164.0 has no native enable/disable verb. The bridge uses the real app-server `config/value/write` API with the user layer's expectedVersion to persist `[plugins."zcode-memory@zcode-memory"].enabled`. It never grants hook trust. Disabled plugins disappear from the native hook inventory. `host update` calls native marketplace upgrade/plugin add and restores the prior enabled state (native add alone re-enables a disabled plugin). Atomic settings, private backups, a write-ahead transaction and `host recover --host codex-cli` protect edits. Recovery restores configuration only, not cached plugin binaries; externally changed or uncertain configurations are never overwritten blindly. Restart sessions after changes. Facts and user memory settings survive update/remove. Review native trust/permissions separately; local bridge installation does not approve hooks. The source adapter directory alone is a template. The legacy configure generator is diagnostic, not the normal installation path.

Codex 0.164.0 has stable hooks and recognizes the provided SessionStart, UserPromptSubmit and Stop entries. Hook content must be trusted in the native host; untrusted or changed hooks do not imply automatic injection. AGENTS.md is guidance for manual MCP calls, not guaranteed execution. Native app-server hooks/list was checked using isolated configuration without a model session; actual model conversation and native hook execution remain unverified. Automatic extraction defaults off and uses local rules unless a model seam is explicitly supplied. No subagent automation, account access or cross-host shared writer is claimed. See the root README, LICENSE and NOTICE.md.

Hook context stays in the transcript, so only this host and Claude use persistent once-only receipts across fresh hook processes. Index and body fingerprints are separate: startup index delivery does not block later complete bodies. Resume retains receipts; SessionStart source=compact resets receipts and cumulative budgets for bounded reinjection. Ordinary no-match queries produce zero stdout bytes. The ephemeral DSH/Pi/PI adapters instead replay their session working set on each model request.
