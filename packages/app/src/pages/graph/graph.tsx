import { createEffect, createMemo, createResource, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { useSearchParams } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import type { ServerResearchosGraphAskOutput } from "@opencode-ai/client"
import { ModuleState } from "@/components/researchos/module-state"
import { ModuleHeader } from "@/components/researchos/module-header"
import { useResearchosShell } from "@/components/researchos/shell-context"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"
import { formatServerError } from "@/utils/server-errors"
import { GraphCanvas } from "./graph-canvas"
import { GraphTopbar } from "./graph-topbar"
import { NodeDrawer } from "./node-drawer"
import { RagBar } from "./rag-bar"
import { nodeColors, type NodeType } from "./graph-colors"

type AskResult = ServerResearchosGraphAskOutput["data"]

export default function GraphPage() {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const shell = useResearchosShell()
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
  const [indexing, setIndexing] = createSignal(false)
  const [indexError, setIndexError] = createSignal<string>()
  const [searchParams, setSearchParams] = useSearchParams<{ paper?: string }>()
  const [paperMiss, setPaperMiss] = createSignal<string>()

  const [graph, graphActions] = createResource(
    () => ({ directory: sdk().directory, type: filter() }),
    async ({ directory, type }) => client().get({
      location: { directory },
      ...(type === "all" ? {} : { type }),
    }).then((result) => result.data),
  )

  const [status] = createResource(
    () => sdk().directory,
    async (directory) => client().status({ location: { directory } }).then((result) => result.data),
  )

  const statusBadge = createMemo<{ status: "ok" | "degraded" | "fail" | "unknown"; label: string; detail?: string }>(() => {
    if (status.error) return { status: "fail", label: "Status probe failed", detail: formatServerError(status.error) }
    const data = status()
    if (!data) return { status: "unknown", label: "Probing…" }
    if (!data.healthy) return { status: "degraded", label: data.backend, detail: data.detail }
    return { status: "ok", label: data.backend, detail: data.detail }
  })

  createEffect(() => shell.setAgentContext({ module: "graph", resource: selectedId() }))
  onCleanup(() => shell.setAgentContext(undefined))

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

  // ?paper=<id> 深链：paper 节点通过 refId 关联 literature 记录，命中后选中并居中
  createEffect(() => {
    const paperId = searchParams.paper
    if (!paperId) return
    const data = graph()
    if (!data || graph.loading) return
    if (filter() !== "all" && filter() !== "paper") {
      setFilter("all")
      return
    }
    setSearchParams({ paper: undefined }, { replace: true })
    if (data.nodes.length === 0) return
    const hit =
      data.nodes.find((node) => node.type === "paper" && node.refId === paperId) ??
      data.nodes.find((node) => node.type === "paper" && node.id === `paper:${paperId}`)
    if (!hit) {
      setPaperMiss(paperId)
      return
    }
    setPaperMiss(undefined)
    setSelectedId(hit.id)
    setFocusRequest((previous) => ({ id: hit.id, seq: (previous?.seq ?? 0) + 1 }))
  })

  const persist = (positions: Array<{ id: string; x: number; y: number }>) => {
    // 布局持久化是后台动作，失败不打断画布交互
    void client().save_layout({ location: { directory: sdk().directory }, positions }).catch(() => {})
  }
  const reindex = async () => {
    if (indexing()) return
    setIndexing(true)
    setIndexError(undefined)
    try {
      await client().reindex({ location: { directory: sdk().directory } })
      await graphActions.refetch()
    } catch (error) {
      setIndexError(formatServerError(error))
    } finally {
      setIndexing(false)
    }
  }

  return (
    <div class="flex h-full min-h-0 flex-col bg-background-base">
      <ModuleHeader route="graph" />
      <GraphTopbar
        filter={filter()}
        layout={layout()}
        status={statusBadge()}
        nodeCount={graph()?.nodes.length ?? 0}
        onFilter={(value) => {
          setFilter(value)
          setSelectedId(undefined)
        }}
        onLayout={setLayout}
        onLocate={locate}
        onReindex={() => void reindex()}
        indexing={indexing()}
      />
      <Show when={indexError()}>
        {(error) => <p class="border-b border-border-weaker-base px-4 py-2 text-12-regular text-text-on-critical-strong">{error()}</p>}
      </Show>
      <Show when={paperMiss()}>
        {(paperId) => (
          <div class="flex items-center gap-3 border-b border-border-weaker-base px-4 py-2">
            <p class="flex-1 text-12-regular text-text-weak">
              No graph node is linked to paper <span class="font-mono text-text-base">{paperId()}</span> yet — build the graph first.
            </p>
            <Button size="small" variant="secondary" disabled={indexing()} onClick={() => void reindex()}>
              Build graph
            </Button>
          </div>
        )}
      </Show>
      <div class="flex min-h-0 flex-1">
        <div class="relative min-w-0 flex-1">
          <Switch>
            <Match when={graph.loading && !graph()}>
              <ModuleState state="running" title="Loading graph…" description="Fetching nodes and edges from the graph backend." />
            </Match>
            <Match when={graph.error}>
              <ModuleState
                state="error"
                title="Graph could not be loaded"
                details={formatServerError(graph.error)}
                action={{ label: "Retry", onClick: () => void graphActions.refetch() }}
              />
            </Match>
            <Match when={(graph()?.nodes.length ?? 0) === 0}>
              <ModuleState
                state="empty"
                title="No graph data yet"
                description="The knowledge graph is built from your papers, notes, and concepts. Import literature or write linked notes, then build the graph to parse wikilinks and citations into nodes and edges."
                action={{ label: "Build graph", onClick: () => void reindex() }}
              />
            </Match>
            <Match when={true}>
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
              <div class="absolute bottom-3 left-3 flex flex-col gap-1 rounded-md border border-border-weaker-base bg-background-base px-2.5 py-2">
                <For each={Object.entries(nodeColors) as Array<[NodeType, string]>}>
                  {([type, color]) => (
                    <div class="flex items-center gap-1.5">
                      <span class="inline-block size-2 rounded-full" style={{ "background-color": color }} />
                      <span class="text-10-regular capitalize text-text-weak">{type}</span>
                    </div>
                  )}
                </For>
              </div>
            </Match>
          </Switch>
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
