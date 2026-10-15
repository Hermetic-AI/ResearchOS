import { createMemo, createResource, For, Show } from "solid-js"
import { Spinner } from "@opencode/ui/spinner"
import { Badge } from "@opencode/ui/badge"
import { useNavigate } from "@solidjs/router"
import { useResearchosLink } from "@/components/researchos-rail"
import type { ServerResearchosGraphGraphNodeOutput } from "@opencode/client"
import { nodeColors } from "./graph-colors"

type NodeDetail = ServerResearchosGraphGraphNodeOutput["data"]

export function NodeDrawer(props: {
  nodeId: string
  fetcher: (id: string) => Promise<NodeDetail>
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const link = useResearchosLink()
  const [detail] = createResource(
    () => props.nodeId,
    (id) => props.fetcher(id),
  )
  const neighbors = createMemo(() => (detail()?.neighbors.nodes ?? []).filter((node) => node.id !== props.nodeId))

  return (
    <aside class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border-weaker-base bg-background-stronger px-5 py-5">
      <Show when={detail.loading}>
        <div class="flex items-center gap-2 text-12-regular text-text-weak"><Spinner class="size-4" /> Loading node…</div>
      </Show>
      <Show when={detail.error}>
        {(error) => <p class="text-12-regular text-text-on-critical-strong">{error instanceof Error ? error.message : String(error)}</p>}
      </Show>
      <Show when={detail()}>
        {(data) => (
          <>
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="mt-1 inline-block size-2.5 shrink-0 rounded-full" style={{ "background-color": nodeColors[data().node.type] }} />
                <h2 class="text-14-medium leading-6 text-text-base">{data().node.label}</h2>
              </div>
              <button type="button" class="text-11-regular text-text-weak hover:text-text-base" onClick={props.onClose}>Close</button>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <Badge>{data().node.type}</Badge>
              <Show when={data().node.sourcePath}>
                {(path) => <span class="font-mono text-10-regular text-text-weaker">{path()}</span>}
              </Show>
            </div>

            <Show when={data().paper}>
              {(paper) => (
                <section class="mt-5 rounded-lg border border-border-weaker-base bg-surface-base p-4">
                  <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">Literature record</p>
                  <p class="mt-2 text-12-medium leading-5 text-text-base">{paper().title}</p>
                  <p class="mt-1 text-11-regular text-text-weak">{paper().authors.join(", ") || "Unknown authors"}</p>
                  <div class="mt-2 flex flex-wrap gap-2 text-11-regular text-text-weak">
                    <span>{paper().year ?? "n.d."}</span>
                    <span>{paper().citationCount.toLocaleString()} citations</span>
                  </div>
                  <Show when={paper().doi}>
                    {(doi) => <p class="mt-1 break-all font-mono text-10-regular text-text-weaker">{doi()}</p>}
                  </Show>
                  <button
                    type="button"
                    class="mt-3 text-11-medium text-text-interactive-base hover:underline"
                    onClick={() => navigate(link()!.module(`literature`))}
                  >
                    Open in literature
                  </button>
                </section>
              )}
            </Show>

            <Show when={!data().paper && data().node.type !== "paper"}>
              <section class="mt-5">
                <p class="text-12-regular leading-5 text-text-weak">
                  {data().node.type === "repo"
                    ? "Code repository node. Open it in the editor to explore the implementation."
                    : "Note or concept node. Read the source file for full content."}
                </p>
              </section>
            </Show>

            <section class="mt-6 border-t border-border-weaker-base pt-4">
              <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">
                Neighbors ({neighbors().length})
              </p>
              <Show when={neighbors().length === 0}>
                <p class="mt-2 text-12-regular text-text-weak">No linked nodes yet.</p>
              </Show>
              <For each={neighbors()}>
                {(neighbor) => (
                  <button
                    type="button"
                    class="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-surface-base-hover"
                    onClick={() => props.onSelect(neighbor.id)}
                  >
                    <span class="inline-block size-2 shrink-0 rounded-full" style={{ "background-color": nodeColors[neighbor.type] }} />
                    <span class="truncate text-12-regular text-text-base">{neighbor.label}</span>
                  </button>
                )}
              </For>
            </section>
          </>
        )}
      </Show>
    </aside>
  )
}
