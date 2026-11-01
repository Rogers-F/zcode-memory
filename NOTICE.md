# ZCode Memory Unified notices

Licensed under Apache License 2.0. See LICENSE. This is an independent derivative, not an official or endorsed product of Z.ai, DeepSeek, Anthropic, OpenAI or Pi.

Reference snapshots (read-only during this implementation):

- zai-org/ZCode: a60ba6a7e5a06742270ca605f5d2cc2766afa7e1, Copyright 2026 Z.AI Co., Ltd., Apache-2.0. Used as behavior/source reference, not installed as a replacement memory adapter.
- Rogers-F/pi-zcode-memory (original manifest author: Tioit-Wang): 946784717c56b19bc09ddf8808c2f5eaea3e418b, Apache-2.0. Management panel, extension events, model queue, prompts, guarded ToolRunner, legacy archive and tests are retained/adapted in adapters/pi-desktop. Original author attribution and source mapping remain in its NOTICE.md and source materials.
- Rogers-F/dsh-zcode-memory: 12f741bf84a9619a50fa5ae8f0672789d1b7e4ca, Apache-2.0. DSH native services, engine/tool policy, scoped prompts, authenticated settings viewer and native test harness are retained/adapted in adapters/dsh. Its original ZCode 3.16.1 snapshot notices, hashes and assets remain intact reference materials. Do not identify that older snapshot with the separate official Git commit above.

Modifications in this unified project (2026): shared Markdown/YAML core; atomic journaled storage and cross-process bakery locking; semantic/hash duplicate control, conflicts and restorable revisions; Chinese-aware incremental extraction and cancellation; budgeted BM25 and selective body reads; explicit copy migration/exchange; core integration into desktop/DSH mutations; opt-in defaults; new manual panel controls and unified native tools; Claude/Codex MCP/hooks and Pi native extension; isolated scripted-model tests and independent packaging. These changes intentionally diverge from old source-alignment matrices. Upstream tests/documents under copied adapters are historical references unless explicitly run by the root test scripts.

Dependencies retain their own license texts in distributed node_modules. The unchanged CommonJS runtime of yaml 2.9.0 is also vendored under vendor/yaml (ISC, LICENSE included) so Git marketplace installs need no npm install or user credentials:

- yaml 2.9.0: ISC; package LICENSE included. The core uses its YAML document API to preserve unknown legacy fields.
- marked 18.0.11: MIT (runtime DSH Markdown parser). The retained prebuilt DSH browser bundle separately contains marked 16.4.2 with its existing notice at adapters/dsh/assets/licenses/marked-LICENSE.md.
- unbash 4.0.1: optional DSH runtime dependency, ISC; not bundled in the offline artifact. Absent parser disables the relevant POSIX shell classification path.
- React and DSH service packages: host-provided externals, not copied into the distribution. Their licenses remain with their installed host.

The local dependency copies were taken only from installed public program packages; no credentials, user memory, model account state or private configuration is bundled. sources.json records reference identities; adapter source manifests identify their original snapshots and are not hashes of these modified executing files.
