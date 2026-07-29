import { createSignal, For, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { nodeColors, type NodeType } from "./graph-colors"

const TYPES: Array<{ value: NodeType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "paper", label: "Papers" },
  { value: "note", label: "Notes" },
  { value: "concept", label: "Concepts" },
  { value: "repo", label: "Repos" },
]

export function GraphTopbar(props: {
  filter: NodeType | "all"
  layout: "force" | "circle"
  onFilter: (filter: NodeType | "all") => void
  onLayout: (layout: "force" | "circle") => void
  onLocate: (label: string) => void
}) {
  const [term, setTerm] = createSignal("")
  return (
    <div class="flex items-center gap-2 border-b border-border-weaker-base px-4 py-2.5">
      <For each={TYPES}>
        {(type) => (
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-12-medium text-text-weak outline-none hover:bg-surface-base-hover"
            classList={{ "bg-surface-base-hover text-text-base": props.filter === type.value }}
            onClick={() => props.onFilter(type.value)}
          >
            <Show when={type.value !== "all"}>
              <span class="inline-block size-2 rounded-full" style={{ "background-color": nodeColors[type.value as NodeType] }} />
            </Show>
            {type.label}
          </button>
        )}
      </For>
      <div class="flex-1" />
      <input
        aria-label="Locate node by label"
        value={term()}
        onInput={(event) => setTerm(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && term().trim()) props.onLocate(term().trim())
        }}
        placeholder="Locate node by label…"
        class="w-52 rounded-md border border-border-base bg-surface-inset-base px-3 py-1.5 text-12-regular text-text-base outline-none placeholder:text-text-weaker focus:border-border-focus"
      />
      <Button size="small" variant="secondary" disabled={!term().trim()} onClick={() => props.onLocate(term().trim())}>
        Locate
      </Button>
      <div class="ml-2 flex rounded-md border border-border-base">
        <LayoutButton label="Force" active={props.layout === "force"} onClick={() => props.onLayout("force")} />
        <LayoutButton label="Circle" active={props.layout === "circle"} onClick={() => props.onLayout("circle")} />
      </div>
    </div>
  )
}

function LayoutButton(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="px-2.5 py-1.5 text-12-medium text-text-weak outline-none hover:bg-surface-base-hover"
      classList={{ "bg-surface-base-hover text-text-base": props.active }}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}
