import { Global } from "@opencode-ai/core/global"
import { Location } from "@opencode-ai/core/location"
import { AgentV2 } from "@opencode-ai/core/agent"
import { CommandV2 } from "@opencode-ai/core/command"
import { SkillV2 } from "@opencode-ai/core/skill"
import { InvalidRequestError, UnknownError } from "@opencode-ai/protocol/errors"
import {
  HubImpl,
  createAcademicHub,
} from "@researchos/api-hub"
import { Effect, FileSystem } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { mkdir, rename, rm } from "fs/promises"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import path from "path"
import { Api } from "../api"
import { response } from "../location"
import { resolveAssetPath } from "./researchos-assets-path"

const hubs = new Map<string, HubImpl>()

export const ResearchosAssetsHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-assets",
  (handlers) =>
    handlers
      .handle("asset.fileRead", ({ payload }) => response(readRules(payload.scope)))
      .handle("asset.fileWrite", ({ payload }) => response(writeAsset(payload)))
      .handle("asset.noteWrite", ({ payload }) => response(writeNote(payload)))
      .handle("asset.presetInstall", ({ payload }) => response(installPreset(payload)))
      .handle("api.list", () => response(apiList()))
      .handle("api.stats", () => response(apiStats()))
      .handle("api.test", ({ payload }) => response(apiTest(payload.name))),
)

function apiList() {
  return apiHub().pipe(
    Effect.map((hub) => hub.list().map((descriptor) => ({
      name: descriptor.name,
      description: descriptor.description,
      baseUrl: descriptor.baseUrl,
      auth: descriptor.auth,
      rps: descriptor.rateLimit.rps,
      burst: descriptor.rateLimit.burst ?? 1,
      cacheTtlS: descriptor.cacheTtlS,
      enabled: descriptor.enabled,
    }))),
    Effect.mapError(fileError),
  )
}

function apiStats() {
  return apiHub().pipe(
    Effect.map((hub) => hub.list().map((descriptor) => hub.status(descriptor.name))),
    Effect.mapError(fileError),
  )
}

function apiTest(name: string) {
  return apiHub().pipe(
    Effect.flatMap((hub) => Effect.tryPromise({
      try: () => hub.test(name),
      catch: fileError,
    })),
    Effect.mapError(fileError),
  )
}

function apiHub() {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const existing = hubs.get(location.directory)
    if (existing) return existing
    const hub = createAcademicHub({
      projectRoot: location.directory,
      credentials: {
        semantic_scholar: { key: "{env:S2_API_KEY}" },
        pubmed: { key: "{env:NCBI_API_KEY}" },
        crossref: { mailto: "{env:CROSSREF_MAILTO}" },
      },
    })
    hubs.set(location.directory, hub)
    return hub
  })
}

function readRules(scope: "project" | "global") {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const chain = [path.join(location.directory, "AGENTS.md"), path.join(Global.make().config, "AGENTS.md")]
    const selected = scope === "project" ? chain[0] : chain[1]
    const exists = yield* Effect.all(
      chain.map((item) =>
        Effect.tryPromise({
          try: () => Bun.file(item).exists(),
          catch: fileError,
        }),
      ),
    )
    const content = exists[scope === "project" ? 0 : 1]
      ? yield* Effect.tryPromise({ try: () => Bun.file(selected).text(), catch: fileError })
      : ""

    return {
      path: selected,
      content,
      chain: chain.map((item, index) => ({ path: item, exists: exists[index] })),
    }
  }).pipe(Effect.mapError(fileError))
}

function writeAsset(input: {
  readonly kind: "skill" | "agent" | "command" | "rules"
  readonly name: string
  readonly content: string
  readonly scope: "project" | "global"
}) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const target = yield* resolveAssetPath(input, location.directory, Global.make().config)
    yield* writeAtomically(target, input.content)
    if (input.kind === "agent") {
      const agent = yield* AgentV2.Service
      yield* agent.reload()
    }
    if (input.kind === "command") {
      const command = yield* CommandV2.Service
      yield* command.reload()
    }
    if (input.kind === "skill") {
      const skill = yield* SkillV2.Service
      yield* skill.reload()
    }

    return { path: target, reloaded: true }
  }).pipe(Effect.mapError((error) => error instanceof InvalidRequestError ? error : fileError(error)))
}

function writeNote(input: { readonly path: string; readonly content: string }) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const normalized = input.path.replace(/\\/g, "/")
    if (!normalized.startsWith("notes/")) {
      return yield* Effect.fail(new InvalidRequestError({ message: "Notes must be written under notes/" }))
    }
    const target = path.join(location.directory, normalized)
    yield* writeAtomically(target, input.content)
    return { path: normalized }
  }).pipe(Effect.mapError((error) => error instanceof InvalidRequestError ? error : fileError(error)))
}

function installPreset(input: {
  readonly pack: "researchos-skills" | "researchos-agents" | "researchos-mcp"
  readonly target: "project" | "global"
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const location = yield* Location.Service
    const root = input.target === "project" ? location.directory : Global.make().config
    if (input.pack === "researchos-mcp") return yield* installMcpPreset(fs, root)

    const preset = path.resolve(import.meta.dir, "../../../researchos-preset")
    const directories = input.pack === "researchos-skills" ? ["skill"] : ["agent", "command"]
    const files = yield* Effect.tryPromise({
      try: async () => {
        const result: string[] = []
        for (const directory of directories) {
          const glob = new Bun.Glob("**/*")
          for await (const file of glob.scan({ cwd: path.join(preset, directory), onlyFiles: true })) {
            result.push(path.join(directory, file))
          }
        }
        return result
      },
      catch: fileError,
    })
    const destination = input.target === "project" ? path.join(root, ".opencode") : root
    const changes = yield* Effect.forEach(files, (file) => snapshot(fs, path.join(destination, file)))

    yield* Effect.forEach(files, (file) =>
      fs.readFile(path.join(preset, file)).pipe(
        Effect.flatMap((content) => writeAtomically(path.join(destination, file), content)),
      ),
    ).pipe(
      Effect.catch((error) =>
        restore(fs, changes).pipe(
          Effect.andThen(Effect.fail(error)),
        ),
      ),
    )

    return { installed: files.map((file) => path.join(destination, file)), configPatched: [] }
  }).pipe(Effect.mapError((error) => error instanceof InvalidRequestError || error instanceof UnknownError ? error : fileError(error)))
}

function installMcpPreset(fs: FileSystem.FileSystem, root: string) {
  return Effect.gen(function* () {
    const source = path.resolve(import.meta.dir, "../../../researchos-preset/opencode.researchos.json")
    const template = yield* fs.readFileString(source).pipe(
      Effect.flatMap((content) => decodeJson(content, source)),
    )
    const mcp = isRecord(template.mcp) ? template.mcp : {}
    const candidates = [path.join(root, "opencode.jsonc"), path.join(root, "opencode.json")]
    const exists = yield* Effect.all(candidates.map((file) => fs.exists(file)))
    const target = candidates[exists[0] ? 0 : 1]
    const original = exists.some(Boolean) ? yield* fs.readFileString(target) : "{}\n"
    yield* decodeJson(original, target)
    const content = Object.entries(mcp).reduce(
      (current, [name, value]) => applyEdits(current, modify(current, ["mcp", name], value, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      })),
      original,
    )

    yield* writeAtomically(target, content)
    return {
      installed: [],
      configPatched: Object.keys(mcp).map((name) => `mcp.${name}`),
    }
  })
}

function decodeJson(content: string, file: string) {
  return Effect.try({
    try: () => {
      const errors: ParseError[] = []
      const value: unknown = parse(content, errors, { allowTrailingComma: true })
      if (errors.length) throw new Error(`Invalid JSONC in ${file}`)
      if (!isRecord(value)) throw new Error(`Expected an object in ${file}`)
      return value
    },
    catch: fileError,
  })
}

function snapshot(fs: FileSystem.FileSystem, target: string) {
  return Effect.gen(function* () {
    const exists = yield* fs.exists(target)
    return { target, content: exists ? yield* fs.readFile(target) : undefined }
  })
}

function restore(
  fs: FileSystem.FileSystem,
  changes: readonly { readonly target: string; readonly content: Uint8Array | undefined }[],
) {
  return Effect.forEach(changes, (change) =>
    change.content
      ? writeAtomically(change.target, change.content)
      : fs.remove(change.target, { force: true }).pipe(Effect.mapError(fileError)),
  ).pipe(Effect.ignore)
}

function writeAtomically(target: string, content: string | Uint8Array) {
  const temporary = `${target}.tmp-${crypto.randomUUID()}`
  return Effect.tryPromise({
    try: async () => {
      await mkdir(path.dirname(target), { recursive: true })
      await Bun.write(temporary, content)
      await rename(temporary, target)
    },
    catch: fileError,
  }).pipe(
    Effect.ensuring(
      Effect.tryPromise({
        try: () => rm(temporary, { force: true }).catch(() => {}),
        catch: fileError,
      }).pipe(Effect.ignore),
    ),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function fileError(error: unknown) {
  return new UnknownError({
    message: error instanceof Error ? error.message : String(error),
    ref: "researchos-assets",
  })
}
