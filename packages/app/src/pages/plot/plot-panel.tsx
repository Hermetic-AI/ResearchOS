import { Button } from "@opencode/ui/button"
import { Show } from "solid-js"
import { useResearchosShell } from "@/components/researchos/shell-context"

export function PlotPanel(props: { resource?: string }) {
  const shell = useResearchosShell()

  const askAgent = () => {
    const target = props.resource ?? "the current chart"
    shell.setPendingPrompt(`@plot Improve the chart ${target}: adjust colors, labels, and layout for publication quality.`)
    shell.setDockOpen(true)
  }

  return (
    <div class="flex h-full flex-col bg-background-base p-4">
      <div class="space-y-4">
        <div>
          <h2 class="text-14-medium text-text-base">Plot Studio</h2>
          <p class="mt-1 text-11-regular text-text-weak">{props.resource ?? "No chart selected"}</p>
        </div>
        <p class="text-12-regular leading-5 text-text-weak">
          Use the plot studio in the main workspace to create statistical charts, diagrams, and canvas visualizations.
        </p>
        <div class="flex gap-2">
          <Button size="small" variant="neutral" onClick={askAgent}>Improve with agent</Button>
        </div>
        <Show when={props.resource}>
          {(resource) => (
            <div class="rounded-md border border-border-weak-base bg-background-stronger p-3">
              <p class="font-mono text-10-regular text-text-weaker">{resource()}</p>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}
