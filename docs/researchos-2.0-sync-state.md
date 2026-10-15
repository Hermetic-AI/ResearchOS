# ResearchOS on opencode 2.0 — sync state and remaining work

Branch `researchos-sync` in this directory (`F:/Jensen/code/opencode-2.0-sync`), based on upstream tag `v2.0.29` (`042d083`).
The user's working repo `F:/Jensen/code/ResearchOS` stays on `release-1.0.0` at opencode 1.18.4 and was NOT modified by this sync, other than one commit (`1fe7e662f`) that landed the 300 uncommitted files so the sync had a clean base.

## What upstream 1.18.4 -> 2.0.29 changed

- 5293 commits, 8511 changed files.
- npm scope renamed: `@opencode-ai/*` -> `@opencode/*` (all 8 packages we import still exist).
- `packages/opencode` deleted; the engine now lives in `packages/core` (+ `server`/`protocol`/`client`/`cli`).
- `packages/app/src/pages/**` replaced by `src/shell`, `src/session`, `src/composer`, `src/workspaces`; routing moved into `packages/app/src/shell/routes/routes.tsx` (lazy `Route` entries).
- `V2_*` naming dropped in core: `AgentV2`/`CommandV2`/`SkillV2` are now `Agent`/`Command`/`Skill`.
- `effect` 4.0.0-beta.83 -> 4.0.1; `effect/unstable/httpapi` -> `effect/http-api`; `protocol`/`core` are NodeNext, so relative imports need `.js`.
- System context mechanism (`core/src/system-context`) removed — no 2.0 successor path.

## Done in this branch

1. `d057cda` — overlay: 406 ResearchOS-only files copied (65 in `packages/app`, all `packages/researchos-*`, all `ros/*`, docs). Zero path collisions with upstream.
2. `b3c1b9c` — codemod `@opencode-ai/` -> `@opencode/` in the overlaid files only (13 upstream files were hit by mistake and reverted; upstream keeps a `@opencode-ai/ai/` compat shim in `packages/core/src/provider.ts`).
3. `afd185d` — re-attach our surface to 2.0's registration points:
   - `packages/protocol/src/api.ts`: 9 researchos groups (imports + `LocationGroups` union + `.add(...middleware(locationMiddleware))`).
   - `packages/server/src/handlers.ts`: 9 researchos handler layers.
   - `packages/server/package.json`: 9 `@researchos/*` deps. `packages/protocol`/`server` files converted to `effect/http-api` and `.js` extensions.

## Verified

- `bun install` at the repo root: OK, workspace packages linked (`packages/server/node_modules/@researchos/*`). 1 optional package failed to install; not fatal.
- `packages/protocol`: `bun run typecheck` -> **0 errors** with our 9 route groups wired in.
- Pristine `v2.0.29` `packages/server`: `bun run typecheck` -> **0 errors** (baseline, so everything below is ours to fix).
- Synced `packages/server`: 97 reported errors, but ~56 are cascade noise from 8 real breakages listed below.

## Remaining work, by cost

| # | Item | Where | Fix |
|---|------|-------|-----|
| 1 | Plugin API changed; `tool` / `PluginModule` no longer exported | `packages/researchos-writing/src/index.ts` (14 err), `packages/researchos-plot-core/src/index.ts` (12 err) | Rewrite both against `@opencode/plugin` (`export * as Plugin from "./promise/plugin.js"`). Then typecheck. |
| 2 | System-context producer gone from core | `packages/core/src/researchos-context.ts` + `test/researchos-context.test.ts` | Needs a design decision: find what replaced `core/src/system-context` in 2.0, or drop ResearchOS prompt-context injection on the 2.0 engine. |
| 3 | core internals renamed/removed | `packages/server/src/handlers/researchos-assets.ts` | `@opencode/core/global` gone; `AgentV2/CommandV2/SkillV2` -> `Agent/Command/Skill`; add `jsonc-parser` back to `packages/server/package.json` deps. |
| 4 | Stricter unused-symbol checks now inherited | `researchos-literature/src/{db,export,import,zotero}.ts`, `researchos-latex/src/format.ts`, `server/src/handlers/researchos-graph.ts` | Delete dead imports/vars (6 trivial edits). |
| 5 | App UI integration must be re-authored | our route block in old `app.tsx` (11 imports + `/:dir` `Route` tree) vs 2.0 `shell/routes/routes.tsx`; `titlebar`, `sidebar-shell`, `prompt-input` (4 files), `layout/home/session` | Port the 13 `packages/app/src/pages/researchos-*.tsx` pages (already copied) into 2.0 lazy-route registry; re-hook rail/menu into `src/shell`. |
| 6 | 17 moved UI primitives | `@opencode/ui/{button,icon,tooltip,spinner,tag,dropdown-menu,v2/*}`, `@opencode/session-ui/message-part`, `@opencode/sdk/v2/client` | Remap to 2.0 paths (`ui/actions/*`, `ui/icons/*`, `ui/overlays/*`, `session-ui/components/*`) or restyle against 2.0 design system. |
| 7 | Generated client is stale | `packages/client/src/generated*/**` (upstream deleted those paths) | Do not port the diff: run `bun run generate` from `packages/client` after items 1-3 land, per AGENTS.md. |
| 8 | Desktop/dev wiring | `packages/desktop/src/main/server.ts` (moved), `vite.config.ts`, `electron.vite.config.ts`, `install`, `script/*` | Re-apply our port/env overrides (14096, `researchos:dev` script) against 2.0 files. |
| 9 | Docs port sweep | 108 files under `packages/web/src/content/docs/**` (`4096` -> `14096`) | Path gone in 2.0; docs moved — re-apply after locating the 2.0 docs home. |

## Not synced (intentionally)

- The 688-file "customization" count is inflated: the fork's root commit is a squash (`f6b387108`) with no common ancestor with upstream, so diffing against `0a601cf33` also reports files that differ only because the squash base is a few commits off. Only ~12 shared files carry actual ResearchOS code, and 4 of them are now wired (items in "Done").
- `.sisyphus/**` (9 local session files) excluded from the overlay.
