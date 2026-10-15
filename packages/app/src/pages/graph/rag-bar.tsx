import { createSignal, For, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Spinner } from "@opencode/ui/spinner"
import type { ServerResearchosGraphGraphAskOutput } from "@opencode/client"
import { StatusBadge } from "@/components/researchos/module-state"
import { nodeColors } from "./graph-colors"

type AskResult = ServerResearchosGraphGraphAskOutput["data"]

export function RagBar(props: {
  ask: (question: string) => Promise<AskResult>
  onResult: (result: AskResult | undefined) => void
  result?: AskResult
  onSelectNode: (id: string) => void
}) {
  const [question, setQuestion] = createSignal("")
  const [asking, setAsking] = createSignal(false)
  const [error, setError] = createSignal<string>()

  const submit = async () => {
    const value = question().trim()
    if (!value || asking()) return
    setAsking(true)
    setError(undefined)
    const result = await props.ask(value).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
      return undefined
    })
    props.onResult(result)
    setAsking(false)
  }

  return (
    <div class="border-t border-border-weaker-base bg-background-stronger px-4 py-3">
      <div class="flex gap-2">
        <input
          aria-label="Ask the knowledge graph"
          value={question()}
          onInput={(event) => setQuestion(event.currentTarget.value)}
          onKeyDown={(event) => event.key === "Enter" && void submit()}
          placeholder="Ask the graph: find related papers, concepts, and code…"
          class="min-w-0 flex-1 rounded-md border border-border-base bg-surface-inset-base px-3 py-2 text-12-regular text-text-base outline-none placeholder:text-text-weaker focus:border-border-focus"
        />
        <Button size="small" variant="submit" disabled={!question().trim() || asking()} onClick={() => void submit()}>
          <Show when={asking()} fallback="Ask"><Spinner class="size-3.5" /></Show>
        </Button>
        <Show when={props.result}>
          <Button size="small" variant="ghost" onClick={() => props.onResult(undefined)}>Clear</Button>
        </Show>
      </div>
      <Show when={error()}>{(message) => <p class="mt-2 text-11-regular text-text-on-critical-strong">{message()}</p>}</Show>
      <Show when={props.result}>
        {(result) => (
          <div class="mt-3 rounded-lg border border-border-weaker-base bg-surface-base p-4">
            <div class="flex items-center justify-between gap-2">
              <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">
                {result().subgraph.nodes.length} nodes · {result().seeds.length} seeds
              </p>
              <Show when={result().degraded}>
                <StatusBadge status="degraded" label="FTS keyword mode" detail="Semantic recall is unavailable; results come from keyword search only." />
              </Show>
            </div>
            <Show when={result().degraded}>
              <p class="mt-2 text-11-regular text-text-weak">
                Semantic recall is unavailable, so the graph answered with keyword (FTS) search only. Results may miss conceptually related nodes.
              </p>
            </Show>
            <Show when={result().sources.length > 0}>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <For each={result().sources}>
                  {(source) => (
                    <button
                      type="button"
                      class="flex items-center gap-1.5 rounded-md border border-border-weaker-base px-2 py-1 text-11-regular text-text-base outline-none hover:bg-surface-base-hover"
                      onClick={() => props.onSelectNode(source.id)}
                    >
                      <span class="inline-block size-1.5 rounded-full" style={{ "background-color": nodeColors[source.type] }} />
                      {source.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={result().seeds.length === 0}>
              <p class="mt-2 text-12-regular text-text-weak">
                Nothing in the graph matches yet. Import papers or write linked notes first, then let the graph agent build edges.
              </p>
            </Show>
            <Show when={result().contextPack}>
              {(pack) => (
                <div class="mt-3">
                  <div class="mb-1 flex items-center justify-between gap-2">
                    <p class="font-mono text-10-medium uppercase tracking-wider text-text-weaker">Context pack</p>
                    <Button size="small" variant="ghost" onClick={() => void navigator.clipboard?.writeText(pack())}>Copy</Button>
                  </div>
                  <pre class="max-h-40 overflow-y-auto whitespace-pre-wrap text-11-regular leading-5 text-text-weak">{pack()}</pre>
                </div>
              )}
            </Show>
            <p class="mt-2 text-11-regular text-text-weaker">
              The graph tools return the subgraph and evidence pack; the answer itself is composed by the chat session or graph agent from this context.
            </p>
          </div>
        )}
      </Show>
    </div>
  )
}
