import { OpenCode } from "@opencode-ai/client"
import { authTokenFromCredentials } from "@/utils/server"

export function createResearchosClient(input: {
  readonly baseUrl: string
  readonly fetch?: typeof globalThis.fetch
  readonly username?: string
  readonly password?: string
}) {
  return OpenCode.make({
    baseUrl: input.baseUrl,
    fetch: input.fetch,
    headers: input.password
      ? { Authorization: `Basic ${authTokenFromCredentials({ username: input.username, password: input.password })}` }
      : undefined,
  })
}
