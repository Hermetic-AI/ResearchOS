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
- System context mechanism (`core/src/system-context`) removed. Its successor is `packages/core/src/instructions` (`Instructions.make/read/diff/renderInitial/renderUpdate`) plus `InstructionBuiltIns`, `InstructionEntry`, `SkillInstructions`, `ReferenceInstructions`, `McpInstructions`, `CodeModeInstructions`, all combined in `SessionContext.select`.
- Plugin API replaced: no `tool()` helper, no `PluginModule`, no `tool` map. A plugin is `Plugin.define({ id, async setup(ctx) })` and registers through domain transforms (`ctx.tool.transform(editor => editor.add({ name, description, input, execute }))`). `Tool.Info.execute` returns `Promise<Result>` where `Result = { output?, content?, metadata? }` — the 1.18.4 `title` field is gone. `context.directory` is now `ctx.location.directory` (captured in `setup`); the per-call `ToolContext` no longer carries a directory.

## Done in this branch

1. `d057cda` — overlay: 406 ResearchOS-only files copied (65 in `packages/app`, all `packages/researchos-*`, all `ros/*`, docs). Zero path collisions with upstream.
2. `b3c1b9c` — codemod `@opencode-ai/` -> `@opencode/` in the overlaid files only (13 upstream files were hit by mistake and reverted; upstream keeps a `@opencode-ai/ai/` compat shim in `packages/core/src/provider.ts`).
3. `afd185d` — re-attach our surface to 2.0's registration points:
   - `packages/protocol/src/api.ts`: 9 researchos groups (imports + `LocationGroups` union + `.add(...middleware(locationMiddleware))`).
   - `packages/server/src/handlers.ts`: 9 researchos handler layers.
   - `packages/server/package.json`: 9 `@researchos/*` deps. `packages/protocol`/`server` files converted to `effect/http-api` and `.js` extensions.
4. Worklist items 1-4 (see table) — plugin rewrite, instructions port, core renames, unused symbols.

## Verified

- `bun install` at the repo root: OK, workspace packages linked (`packages/server/node_modules/@researchos/*`). 1 optional package failed to install; not fatal.
- `packages/protocol`: `bun run typecheck` -> **0 errors** with our 9 route groups wired in.
- Pristine `v2.0.29` `packages/server`: `bun run typecheck` -> **0 errors** (baseline).
- Synced `packages/server`: `bun run typecheck` (`tsgo -b`, src **and** upstream tests) -> **0 errors**.
- Synced `packages/core`: `bun run typecheck` (`tsgo -b tsconfig.json tsconfig.tests.json`) -> **0 errors**.
- `packages/core`: `bun test test/researchos-context.test.ts` -> 5 pass. `packages/researchos-writing` -> 18 pass, `packages/researchos-plot-core` -> 8 pass, `packages/server test/researchos-assets.test.ts` -> 7 pass.
- Errors dropped 97 -> 81 -> 55 -> 53 -> 0; the last 53 were a real wiring bug found by the test project, not noise (see gotcha below).

## Gotchas found while porting

- A handler that does `yield* FileSystem.FileSystem` (effect's tag) or `yield* FSUtil.Service` adds an **unmet requirement** to `Layer.mergeAll` in `packages/server/src/handlers.ts`. The 2.0 app graph does not provide either to handlers, and the leak shows up as 53 identical `Request<"Requires", ...>` errors across untouched upstream `packages/server/test/*.test.ts` files, because those tests build the app through `ServerProcess.start<never, never>`. `packages/server/src` alone typechecks clean, so always typecheck the tests too. 2.0 handlers get FS access from `@opencode/core/filesystem` (`FileSystem.Service`, location/permission scoped) or plain `fs/promises`/`Bun.file`; `researchos-assets.ts` now uses local `readFile`/`rm`/`Bun.file` helpers like the `writeAtomically` it already had.
- `packages/researchos-*` tsconfigs inherited `@tsconfig/bun` defaults (`noUncheckedIndexedAccess: true`), which made `@opencode/ai` sources fail when typechecked from our package. Upstream packages set `noUncheckedIndexedAccess: false`; the two plugin packages now do too.
- Effect 4.0.1 `Schema.Literal` takes exactly **one** literal; a union of literals is `Schema.Literals([...])`. `Schema.Array`/`Schema.Struct` produce `readonly` values, so downstream pure functions had to widen to `ReadonlyArray` (`mergeBibtex`, `bibtexFromLibrary`).

## Remaining work, by cost

| # | Item | Where | Fix |
|---|------|-------|-----|
| 1 | ~~Plugin API changed~~ **done** | `packages/researchos-writing/src/index.ts`, `packages/researchos-plot-core/src/index.ts` | Rewritten as `Plugin.define` + `ctx.tool.transform(editor => editor.add(...))` with Effect Schema inputs; `{ title, output }` results became `{ content }`; `effect` added to both package.json deps; `test/plugin.test.ts` now registers through a fake `ctx.tool.transform`. |
| 2 | ~~System-context producer gone~~ **done** | `packages/core/src/researchos-context.ts` + its test | Ported onto `Instructions`: `ResearchOSContext` is now a location node exposing `load(): Instructions.List` (library + selection sources, `removed` instead of dropping the source, `unavailable` on read failure), wired into `SessionContext.select` (deps + `Effect.all` + combine tail) and `Instance` nodes. Test rewritten against `test/lib/instructions.ts` (`readInitial`/`readUpdate`). |
| 3 | ~~core internals renamed~~ **done** | `packages/server/src/handlers/researchos-assets.ts` | `@opencode/util/global`, `Agent`/`Command`/`Skill`, `jsonc-parser` dep. |
| 4 | ~~unused symbols~~ **done** | `researchos-literature/src/{db,export,import,zotero}.ts`, `researchos-latex/src/format.ts`, `server/src/handlers/researchos-graph.ts` | Dead imports/vars deleted. |
| 5 | App UI integration must be re-authored | our route block in old `app.tsx` (11 imports + `/:dir` `Route` tree) vs 2.0 `shell/routes/routes.tsx`; `titlebar`, `sidebar-shell`, `prompt-input` (4 files), `layout/home/session` | Port the 13 `packages/app/src/pages/researchos-*.tsx` pages (already copied) into 2.0 lazy-route registry; re-hook rail/menu into `src/shell`. |
| 6 | 17 moved UI primitives | `@opencode/ui/{button,icon,tooltip,spinner,tag,dropdown-menu,v2/*}`, `@opencode/session-ui/message-part`, `@opencode/sdk/v2/client` | Remap to 2.0 paths (`ui/actions/*`, `ui/icons/*`, `ui/overlays/*`, `session-ui/components/*`) or restyle against 2.0 design system. |
| 7 | Generated client is stale | `packages/client/src/generated*/**` (upstream deleted those paths) | Do not port the diff: run `bun run generate` from `packages/client` now that items 1-4 land, per AGENTS.md. |
| 8 | Desktop/dev wiring | `packages/desktop/src/main/server.ts` (moved), `vite.config.ts`, `electron.vite.config.ts`, `install`, `script/*` | Re-apply our port/env overrides (14096, `researchos:dev` script) against 2.0 files. |
| 9 | Docs port sweep | 108 files under `packages/web/src/content/docs/**` (`4096` -> `14096`) | Path gone in 2.0; docs moved to `services/www/src/docs/content/**` — re-apply after locating each page. |
| 10 | Plugin config key | `packages/researchos-preset/opencode.researchos.json` | Still uses the V1 `plugin` key; `config/normalize.ts` accepts it and folds it into `plugins`, so this is cosmetic. The two plugins now export only the V2 shape, so they no longer load on the 1.18.4 engine (`docs` migration guide's dual `server()` export is the way back if dual-engine loading is wanted). |

## Not synced (intentionally)

- The 688-file "customization" count is inflated: the fork's root commit is a squash (`f6b387108`) with no common ancestor with upstream, so diffing against `0a601cf33` also reports files that differ only because the squash base is a few commits off. Only ~12 shared files carry actual ResearchOS code, and 4 of them are now wired (items in "Done").
- `.sisyphus/**` (9 local session files) excluded from the overlay.
