import { createResource, onCleanup, type Accessor } from "solid-js"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { createResearchosClient } from "@/utils/researchos-client"

const REFRESH_INTERVAL = 60_000

// Live per-module record counts for the Research section of the sidebar, mirroring the
// dashboard probes. Modules without a durable listing (overview/translate/assets) stay
// undefined, and failed probes stay undefined too — callers render no badge for those.
export function createResearchosCounts(directory: Accessor<string | undefined>) {
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const [counts, countsActions] = createResource(directory, async (dir) => {
    const location = { directory: dir }
    const client = createResearchosClient({
      baseUrl: serverSDK.url,
      fetch: platform.fetch,
      password: serverSDK.server.http.password,
    })
    const values = await Promise.allSettled([
      client["server.researchos-literature"].literature.list({ location, limit: 100 }),
      client["server.researchos-graph"].graph.get({ location }),
      client["server.researchos-latex"].latex.files({ location }),
      client["server.researchos-data"].data.notebooks({ location }),
      client["server.researchos-plot"].plot.artifacts({ location }),
      client["server.researchos-reproduce"].reproduce.list({ location }),
    ])
    const count = (index: number, select: (data: unknown) => number) =>
      values[index]?.status === "fulfilled" ? select(values[index].value.data) : undefined
    return {
      literature: count(0, (data) => (data as unknown[]).length),
      graph: count(1, (data) => (data as { nodes: unknown[] }).nodes.length),
      latex: count(2, (data) => (data as { files: unknown[] }).files.length),
      data: count(3, (data) => (data as unknown[]).length),
      plot: count(4, (data) => (data as unknown[]).length),
      reproduce: count(5, (data) => (data as unknown[]).length),
    } as Record<string, number | undefined>
  })
  const timer = setInterval(() => void countsActions.refetch(), REFRESH_INTERVAL)
  onCleanup(() => clearInterval(timer))
  return counts
}
