import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { For, Show, createEffect, createMemo, createResource, onCleanup } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"
import { useResearchosShell } from "@/components/researchos/shell-context"

export function GraphPanel(props: { nodeId?: string }) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const shell = useResearchosShell()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()
  const client = createMemo(() => createResearchosClient({
    baseUrl: sdk().url,
    fetch: platform.fetch,
    username: serverSDK().server.http.username,
    password: serverSDK().server.http.password,
  })["server.researchos-graph"])

  const [detail] = createResource(
    () => props.nodeId,
    async (id) => client().node({ id, location: { directory: sdk().directory } }).then((result) => result.data),
  )
  const node = () => detail()?.node

  const openFullGraph = () => {
    const id = props.nodeId
    const query = id ? `?node=${encodeURIComponent(id)}` : ""
    navigate(`/${params.dir}/graph${query}`)
  }

  createEffect(() => {
    const current = node()
    shell.setAgentContext(current ? { module: "graph", resource: current.id } : { module: "graph" })
  })
  onCleanup(() => shell.setAgentContext(undefined))

  const askAgent = () => {
    const current = node()
    if (!current) return
    shell.setPendingPrompt(`@graph Explain the node ${current.label} (${current.id}) and its relationships.`)
    shell.setDockOpen(true)
  }

  return (
    <div class="flex h-full flex-col bg-background-base p-4">
      <Show when={detail.loading}><div class="flex justify-center p-8"><Spinner class="size-5" /></div></Show>
      <Show when={detail.error}><p class="text-12-regular text-text-on-critical-strong">{String(detail.error)}</p></Show>
      <Show when={node()}>
        {(value) => (
          <div class="space-y-4">
            <div>
              <h2 class="text-14-medium text-text-base">{value().label}</h2>
              <p class="mt-1 text-11-regular text-text-weak">{value().type} · {value().id}</p>
            </div>
            <Show when={value().attrs?.description}>
              {(description) => <p class="text-12-regular leading-5 text-text-base">{String(description())}</p>}
            </Show>
            <div class="space-y-2">
              <p class="text-10-medium uppercase tracking-wide text-text-weak">Connections</p>
              <Show when={detail()?.neighbors.edges.length}>
                <div class="space-y-1">
                  <For each={detail()?.neighbors.edges.slice(0, 8)}>
                    {(edge) => (
                      <p class="text-11-regular text-text-weak">
                        {edge.from === value().id ? `→ ${edge.to}` : `← ${edge.from}`}
                        <span class="ml-2 text-10-regular text-text-weaker">{edge.relation}</span>
                      </p>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <div class="flex gap-2">
              <Button size="small" variant="secondary" onClick={askAgent}>Ask agent</Button>
              <Button size="small" variant="ghost" onClick={openFullGraph}>Open full graph</Button>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
