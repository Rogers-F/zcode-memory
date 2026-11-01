// SPDX-License-Identifier: Apache-2.0
// Geometry mirrors ZCode Settings → Memory (rounded-xl cards, pill switch, capsule
// scope menu, 36px search field, bg-surface file list); colors consume DSH theme
// tokens so the panel follows the host light/dark theme. Selectors stay scoped.
export const styles = `
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

/* Switch (radix geometry: 32×18 track, 16px thumb) */
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
