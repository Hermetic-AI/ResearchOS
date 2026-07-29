import { createMemo, createResource, createSignal, Show } from "solid-js"
import { Spinner } from "@opencode-ai/ui/spinner"
import type { ServerResearchosGraphAskOutput } from "@opencode-ai/client"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"
import { GraphCanvas } from "./graph-canvas"
import { GraphTopbar } from "./graph-topbar"
import { NodeDrawer } from "./node-drawer"
import { RagBar } from "./rag-bar"
import type { NodeType } from "./graph-colors"

type AskResult = ServerResearchosGraphAskOutput["data"]

export default function GraphPage() {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const client = createMemo(() => createResearchosClient({
    baseUrl: sdk().url,
    fetch: platform.fetch,
    username: serverSDK().server.http.username,
    password: serverSDK().server.http.password,
  })["server.researchos-graph"])

  const [filter, setFilter] = createSignal<NodeType | "all">("all")
  const [layout, setLayout] = createSignal<"force" | "circle">("force")
  const [selectedId, setSelectedId] = createSignal<string>()
  const [askResult, setAskResult] = createSignal<AskResult>()
  const [focusRequest, setFocusRequest] = createSignal<{ id: string; seq: number }>()

  const [graph, graphActions] = createResource(
    () => ({ directory: sdk().directory, type: filter() }),
    async ({ directory, type }) => client().get({
      location: { directory },
      ...(type === "all" ? {} : { type }),
    }).then((result) => result.data),
  )

  const highlightIds = createMemo(() => {
    const result = askResult()
    if (!result) return undefined
    return new Set(result.subgraph.nodes.map((node) => node.id))
  })

  const locate = (label: string) => {
    const hit = (graph()?.nodes ?? []).find((node) => node.label.toLowerCase().includes(label.toLowerCase()))
    if (!hit) return
    setFocusRequest((previous) => ({ id: hit.id, seq: (previous?.seq ?? 0) + 1 }))
  }

  const persist = (positions: Array<{ id: string; x: number; y: number }>) => {
    // 布局持久化是后台动作，失败不打断画布交互
    void client().save_layout({ location: { directory: sdk().directory }, positions }).catch(() => {})
  }

  return (
    <div class="flex h-full min-h-0 flex-col bg-background-base">
      <GraphTopbar
        filter={filter()}
        layout={layout()}
        onFilter={(value) => {
          setFilter(value)
          setSelectedId(undefined)
        }}
        onLayout={setLayout}
        onLocate={locate}
      />
      <div class="flex min-h-0 flex-1">
        <div class="relative min-w-0 flex-1">
          <Show when={graph.loading}>
            <div class="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background-base text-12-regular text-text-weak">
              <Spinner class="size-4" /> Loading graph…
            </div>
          </Show>
          <Show when={graph.error}>
            {(error) => (
              <div class="absolute inset-0 z-10 flex items-center justify-center">
                <p class="max-w-md text-center text-12-regular text-text-on-critical-strong">
                  {error instanceof Error ? error.message : String(error)}
                </p>
              </div>
            )}
          </Show>
          <Show when={!graph.loading && !graph.error && (graph()?.nodes.length ?? 0) === 0}>
            <div class="absolute inset-0 z-10 flex items-center justify-center">
              <div class="max-w-sm text-center">
                <h1 class="text-14-medium text-text-base">No graph data yet</h1>
                <p class="mt-2 text-12-regular leading-5 text-text-weak">
                  The knowledge graph is built from your papers, notes, and concepts. Import literature or write
                  linked notes, then let the graph agent parse wikilinks and citations into nodes and edges.
                </p>
              </div>
            </div>
          </Show>
          <GraphCanvas
            nodes={graph()?.nodes ?? []}
            edges={graph()?.edges ?? []}
            layout={layout()}
            selectedId={selectedId()}
            highlightIds={highlightIds()}
            focusRequest={focusRequest()}
            onSelect={setSelectedId}
            onPersist={persist}
          />
        </div>
        <Show when={selectedId()}>
          {(id) => (
            <NodeDrawer
              nodeId={id()}
              fetcher={(nodeId) => client().node({ id: nodeId, location: { directory: sdk().directory } }).then((result) => result.data)}
              onSelect={setSelectedId}
              onClose={() => setSelectedId(undefined)}
            />
          )}
        </Show>
      </div>
      <RagBar
        ask={(question) => client().ask({ location: { directory: sdk().directory }, question }).then((result) => result.data)}
        result={askResult()}
        onResult={setAskResult}
        onSelectNode={(id) => {
          setSelectedId(id)
          graphActions.refetch()
        }}
      />
    </div>
  )
}
