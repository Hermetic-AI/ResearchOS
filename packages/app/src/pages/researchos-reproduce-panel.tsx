import { Button } from "@opencode-ai/ui/button"
import { Show } from "solid-js"
import { useResearchosShell } from "@/components/researchos/shell-context"

export function ReproducePanel(props: { resource?: string }) {
  const shell = useResearchosShell()

  const askAgent = () => {
    const target = props.resource ?? "the current run"
    shell.setPendingPrompt(`@reproduce-doctor Diagnose the reproduction run ${target} and explain the failure.`)
    shell.setDockOpen(true)
  }

  return (
    <div class="flex h-full flex-col bg-background-base p-4">
      <div class="space-y-4">
        <div>
          <h2 class="text-14-medium text-text-base">Code Reproduction</h2>
          <p class="mt-1 text-11-regular text-text-weak">{props.resource ?? "No run selected"}</p>
        </div>
        <p class="text-12-regular leading-5 text-text-weak">
          Manage six-step reproduction runs in the main workspace. The panel shows the current run status and hands failures to the doctor agent.
        </p>
        <div class="flex gap-2">
          <Button size="small" variant="secondary" onClick={askAgent}>Diagnose with agent</Button>
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
