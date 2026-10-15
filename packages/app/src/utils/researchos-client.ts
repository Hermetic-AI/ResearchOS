import { OpenCode, type OpenCodeClient } from "@opencode/client"
import { authTokenFromCredentials } from "@/runtime/server/api"

export function createResearchosClient(input: {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
  readonly password?: string
}): OpenCodeClient {
  return OpenCode.make({
    baseUrl: input.baseUrl,
    fetch: input.fetch,
    headers: input.password
      ? { Authorization: `Basic ${authTokenFromCredentials({ password: input.password })}` }
      : undefined,
  })
}
