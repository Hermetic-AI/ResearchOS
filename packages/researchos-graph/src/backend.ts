import path from "path"
import { z } from "zod"

export const GraphBackendConfig = z.discriminatedUnion("backend", [
  z.object({ backend: z.literal("sqlite") }),
  z.object({
    backend: z.enum(["neo4j", "memgraph", "tugraph"]),
    uri: z.string().url(),
    database: z.string().optional(),
    usernameEnv: z.string().min(1).optional(),
    passwordEnv: z.string().min(1).optional(),
  }),
])
export type GraphBackendConfig = z.infer<typeof GraphBackendConfig>

export async function loadGraphBackend(projectRoot: string): Promise<GraphBackendConfig> {
  const file = Bun.file(path.join(projectRoot, ".opencode", "researchos.json"))
  if (!(await file.exists())) return { backend: "sqlite" }
  const input = await file.json().catch(() => ({}))
  return GraphBackendConfig.parse((input as { graph?: unknown }).graph ?? { backend: "sqlite" })
}

export function backendCredentials(config: Exclude<GraphBackendConfig, { backend: "sqlite" }>) {
  if (!config.usernameEnv && !config.passwordEnv) return
  if (!config.usernameEnv || !config.passwordEnv) throw new Error(`${config.backend} requires both usernameEnv and passwordEnv`)
  const username = process.env[config.usernameEnv]
  const password = process.env[config.passwordEnv]
  if (!username || !password) throw new Error(`${config.backend} requires ${config.usernameEnv} and ${config.passwordEnv}`)
  return { username, password }
}
