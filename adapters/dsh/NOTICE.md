# Unified derivative notice (2026)

This adapter is modified for ZCode Memory Unified. Shared storage, opt-in defaults, tools and integration tests differ from the original port. Read the root NOTICE.md and README for current behavior. The original notices below are preserved as historical provenance; their paths, dependency versions and behavior-alignment claims describe the original snapshot.

# DSH ZCode Memory notices

This is an independent adaptation, not an official Z.ai or DeepSeek product and not endorsed by either.

Copyright 2026 Z.AI Co., Ltd. ZCode-derived memory prompts, storage rules, engine and shell-policy implementation are licensed under Apache License 2.0. The exact source snapshot version is 3.16.1; it was supplied without Git metadata. Per-file SHA256 identities appear in assets/source-manifest.json and src/engine/source-manifest.json. Do not infer a commit ID from a later remote branch lookup.

MODIFICATIONS (2026-10-19): TypeScript ported to JavaScript ESM; host services replaced with DSH scoped prompt/session/tool/model Adapters; .zcode storage names mapped to a separate DSH-owned store; DSH-native authenticated readonly UI; stricter symlink/case/size/partial-read safety rules; snapshot/cancellation control; model request/replay metadata audit. See README.md and assets/STORAGE-NOTES.md for intentional differences. Modified source files carry notices.

The upstream full notice is redistributed in UPSTREAM-NOTICE.md; it describes ZCode, not a claim that this plugin implements all unrelated ZCode features. Apache-2.0 text is in LICENSE. Original memory sources/prompts included in assets/upstream are unchanged reference assets, not additional executing plugins.

The browser bundle includes marked 16.4.2. Its MIT and Markdown-origin license notices are redistributed in assets/licenses/marked-LICENSE.md. Runtime dependencies yaml 2.9.1 and unbash 4.0.1 are ISC-licensed and obtained through the package manager with their own notices. React is a host-provided browser external, not bundled here.

Privacy: memory facts and the model context needed for extraction are sent to the model provider selected for the originating DSH turn. Local storage does NOT mean local-only inference. Background requests/usage/tool outcomes are recorded as ignorable plugin audit records in the DSH session log. The plugin never reads ZCode's user profile, copies provider credentials, uploads to a new memory service, or installs a vector database.

Enabling the feature authorizes a narrow application-private memory store. Only registered file tools targeting that store receive its file protocol. DSH tools/pre-execute and monotonic guards still run; read-only mode rejects mutations. Workspace-write grants remain unchanged for ordinary project paths. No general sandbox override or arbitrary shell execution is introduced.
