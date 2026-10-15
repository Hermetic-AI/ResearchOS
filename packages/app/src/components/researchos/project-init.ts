import type { ServerConnection } from "@/context/server"
import { createResearchosClient } from "@/utils/researchos-client"

export type EnsureResearchosProjectInput = {
  readonly directory: string
  readonly conn: ServerConnection.Any
  readonly fetch?: typeof globalThis.fetch
}

export type EnsureResearchosProjectResult = {
  readonly installed: boolean
  readonly error?: string
}

// Auto-seed a directory with the ResearchOS preset (MCP servers, agents, skills)
// and the notes/ directory structure. The operation is idempotent: it skips
// installation when a representative agent file already exists.
export async function ensureResearchosProject(
  input: EnsureResearchosProjectInput,
): Promise<EnsureResearchosProjectResult> {
  const http = input.conn.http
  const client = createResearchosClient({
    baseUrl: http.url,
    fetch: input.fetch,
    username: http.username,
    password: http.password,
  })
  const location = { directory: input.directory }

  const hasPreset = await client.files
    .list({ location, path: ".opencode/agent" })
    .then((result) => (result.data ?? []).some((item) => item.type === "file" && item.path.endsWith("paper-writer.md")))
    .catch(() => false)

  if (hasPreset) return { installed: false }

  try {
    const assetApi = client["server.researchos-assets"]
    await assetApi.presetInstall({ location, pack: "researchos-mcp", target: "project" })
    await assetApi.presetInstall({ location, pack: "researchos-agents", target: "project" })
    await assetApi.presetInstall({ location, pack: "researchos-skills", target: "project" })
    return { installed: true }
  } catch (error) {
    return { installed: false, error: error instanceof Error ? error.message : String(error) }
  }
}
