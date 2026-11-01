# Release and marketplace maintenance

This workflow prepares reviewable files. No command below is executed by the
build to tag, push, publish, install into real hosts or silently update users.

1. Update the root package version, then run `npm run release:prepare`. It syncs
   package locks, adapter/root plugin versions, Claude marketplace version,
   the Kimi versioned ZIP URL and the MCP/lifecycle runtime version. Update the
   README's explicit versioned commands and change notes in the same review.
2. Run `npm run verify`, `npm run test:lifecycle`, `npm run test:hosts`,
   `npm run test:pi`, `npm run test:cli`, and `npm run benchmark`. Inspect the
   reports' native boundaries; scripted models are not authenticated host turns.
   `npm run release:check` rejects version and runtime/catalog drift.
3. Review the source diff and licenses. `bin/`, `src/`, `vendor/yaml/`, root
   `.claude-plugin/{plugin,marketplace}.json`, root `.codex-plugin/plugin.json`,
   `.agents/plugins/marketplace.json` and the adapter MCP/hooks must be committed
   together. Git marketplace installs use those tracked files, not `dist`.
   YAML's unmodified CJS files and ISC license are included; no install hook is
   needed for a marketplace clone. DSH's retained browser bundle is tracked at
   `adapters/dsh/assets/client-runtime.cjs` (existing Apache/MIT notices retained);
   build copies it to packaged dist/client.js, independent of ignored adapter
   output. If changing its client source, rebuild/review this tracked resource
   and license notice with the DSH build tools before packaging. Do not commit node_modules, dist, artifacts,
   .work, user data, credentials or machine-specific paths.
4. After a human approves the commit/push/tag, publish the six verified assets
   under the matching existing tag (for this version `v0.3.1`):

   - `zcode-memory-0.3.1.tgz` (Pi package / optional persistent control CLI)
   - `zcode-memory-claude-code-0.3.1.tgz` (offline runtime)
   - `zcode-memory-codex-cli-0.3.1.tgz` (offline runtime)
   - `zcode-memory-dsh-0.3.1.tgz`
   - `local.zcode-memory-unified-0.3.1.piplug`
   - `zcode-memory-kimi-cli-0.3.1.zip`

   The manual `Package release` GitHub workflow builds/verifies and uploads these
   files for review. It does not create a tag or GitHub Release. A maintainer can
   later run `gh release create v0.3.1 --verify-tag --draft` and upload exactly
   those six assets plus SHA256SUMS, verify them, then explicitly publish.
5. Smoke-test public marketplace registration and the Kimi release URL after
   publication. These remote URLs cannot be validated before the assets exist.
   Refresh Claude's marketplace then plugin; for Codex use
   `zcode-memory host update --host codex-cli` (native re-add alone re-enables
   disabled plugins). Preserve any disabled state, and review new hook trust
   hashes. A pinned Pi tag or Kimi ZIP URL is advanced by the user explicitly.

The tracked marketplace version follows the published source revision. Never
point a source entry at a local absolute path or an ignored generated directory.
Publishing a Git marketplace is separate from directory endorsement by a host.

Official lifecycle/schema references: [Claude marketplaces](https://code.claude.com/docs/en/plugin-marketplaces),
[Claude management](https://code.claude.com/docs/en/discover-plugins),
[OpenAI plugin packages/config](https://developers.openai.com/plugins/build/plugins),
[Kimi plugins](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html).
Pi schema and command behavior are also checked against the installed Pi 1.4.0
public `docs/packages.md` and native commands, using isolated configuration.
