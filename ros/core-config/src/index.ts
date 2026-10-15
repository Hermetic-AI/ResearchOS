export * as CoreConfig from "./index"

import { existsSync, readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { z } from "zod"

const OpenAIProvider = z.object({
  kind: z.literal("openai"),
  baseUrl: z.string().default("https://api.openai.com/v1"),
  apiKey: z.string().default(""),
  model: z.string().default("gpt-4o-mini"),
})

const MockProvider = z.object({ kind: z.literal("mock") })

const Provider = z.discriminatedUnion("kind", [OpenAIProvider, MockProvider])

const FileConfig = z.object({
  home: z.string().default(join(homedir(), ".researchos")),
  provider: z.string().default("mock"),
  model: z.string().optional(),
  maxSteps: z.number().int().positive().max(64).default(8),
  providers: z.record(z.string(), Provider).default({ mock: { kind: "mock" } }),
})

export type ProviderConfig = z.infer<typeof Provider>
export type Config = z.infer<typeof FileConfig> & { configFile?: string }

export const DEFAULT_CONFIG: Config = FileConfig.parse({})

export function loadConfig(explicitPath?: string): Config {
  const candidates = [
    explicitPath,
    process.env.RESEARCHOS_CONFIG,
    join(process.cwd(), "researchos.config.json"),
    join(homedir(), ".researchos", "researchos.config.json"),
  ].filter((p): p is string => !!p)
  const file = candidates.find((path) => existsSync(path))
  if (!file) return DEFAULT_CONFIG
  const raw = interpolateEnv(JSON.parse(readFileSync(file, "utf8")))
  const parsed = FileConfig.parse(raw)
  return { ...parsed, configFile: file }
}

// "${OPENAI_API_KEY}" style references keep secrets out of the config file.
function interpolateEnv(value: unknown): unknown {
  if (typeof value === "string") {
    const match = /^\$\{([A-Z0-9_]+)\}$/.exec(value)
    if (match === null) return value
    return process.env[match[1] as string] ?? ""
  }
  if (Array.isArray(value)) return value.map(interpolateEnv)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolateEnv(v)]))
  }
  return value
}

export function resolveProvider(config: Config, name?: string): { name: string; provider: ProviderConfig } {
  const key = name ?? config.provider
  const provider = config.providers[key]
  if (!provider) throw new Error(`provider "${key}" not found in config (known: ${Object.keys(config.providers).join(", ")})`)
  return { name: key, provider }
}
