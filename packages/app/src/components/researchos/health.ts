import { createMemo, createResource, onCleanup } from "solid-js"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { useResearchosDirectory } from "@/components/researchos-rail"
import { createResearchosClient } from "@/utils/researchos-client"
import { checkServerHealth } from "@/runtime/server/health"

export type ResearchosServiceStatus = "ok" | "degraded" | "fail" | "off" | "unknown"

export type ResearchosServiceHealth = {
  readonly id: string
  readonly name: string
  readonly status: ResearchosServiceStatus
  readonly detail?: string
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const probeOrder = ["backend", "graph", "mcp", "api"] as const

const serviceNames: Record<(typeof probeOrder)[number], string> = {
  backend: "Backend",
  graph: "Graph",
  mcp: "MCP",
  api: "API Hub",
}

const probing = probeOrder.map((id) => ({ id, name: serviceNames[id], status: "unknown" as const, detail: "Probing…" }))

const failed = (id: (typeof probeOrder)[number], error: unknown): ResearchosServiceHealth => ({
  id,
  name: serviceNames[id],
  status: "fail",
  detail: errorMessage(error),
})

const settled = <T,>(result: PromiseSettledResult<T> | undefined, map: (value: T) => ResearchosServiceHealth, id: (typeof probeOrder)[number]) => {
  if (!result) return { id, name: serviceNames[id], status: "unknown" as const, detail: "Probe did not run" }
  if (result.status === "rejected") return failed(id, result.reason)
  return map(result.value)
}

export function createResearchosHealth() {
  const directory = useResearchosDirectory()
    const serverSDK = useServerSDK()
  const platform = usePlatform()

  const [resource, { refetch }] = createResource(
    () => ({ directory: directory(), url: serverSDK.url }),
    async ({ directory }): Promise<ResearchosServiceHealth[]> => {
      const location = { directory }
      const client = createResearchosClient({
        baseUrl: serverSDK.url,
        fetch: platform.fetch,
        password: serverSDK.server.http.password,
      })
      const [backend, graph, mcp, api] = await Promise.allSettled([
        checkServerHealth(serverSDK.server.http, platform.fetch ?? globalThis.fetch),
        client["server.researchos-graph"].graph.status({ location }),
        serverSDK.api.mcp.list({ location }),
        client["server.researchos-assets"].asset.api.stats({ location }),
      ])

      return [
        settled(backend, (health) => ({
          id: "backend",
          name: serviceNames.backend,
          status: health.healthy ? "ok" : "fail",
          detail: health.healthy ? `Server reachable${health.version ? ` · v${health.version}` : ""}` : "Server reported unhealthy",
        }), "backend"),
        settled(graph, (result) => ({
          id: "graph",
          name: serviceNames.graph,
          status: result.data.healthy ? "ok" : "degraded",
          detail: `${result.data.backend} · ${result.data.detail}`,
        }), "graph"),
        settled(mcp, (result) => {
          const entries = result.data ?? []
          const connected = entries.filter((entry) => entry.status.status === "connected").length
          const broken = entries.filter((entry) => entry.status.status === "failed").length
          if (entries.length === 0) return { id: "mcp", name: serviceNames.mcp, status: "off" as const, detail: "No MCP servers configured" }
          if (broken > 0) return { id: "mcp", name: serviceNames.mcp, status: "degraded" as const, detail: `${connected} connected · ${broken} failed` }
          return { id: "mcp", name: serviceNames.mcp, status: "ok" as const, detail: `${connected} connected` }
        }, "mcp"),
        settled(api, (result) => {
          const entries = result.data ?? []
          const healthy = entries.filter((entry) => entry.state === "healthy").length
          const broken = entries.filter((entry) => entry.state === "failed").length
          if (entries.length === 0) return { id: "api", name: serviceNames.api, status: "off" as const, detail: "No API adapters configured" }
          if (broken > 0) return { id: "api", name: serviceNames.api, status: "degraded" as const, detail: `${healthy} healthy · ${broken} failed of ${entries.length}` }
          return { id: "api", name: serviceNames.api, status: "ok" as const, detail: `${healthy} of ${entries.length} adapters healthy` }
        }, "api"),
      ]
    },
  )

  const interval = setInterval(() => refetch(), 30_000)
  onCleanup(() => clearInterval(interval))

  return {
    services: createMemo(() => resource() ?? probing),
    refetch: () => refetch(),
  }
}

export type ResearchosHealth = ReturnType<typeof createResearchosHealth>
