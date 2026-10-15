import { Button } from "@opencode-ai/ui/button"
import { Show } from "solid-js"
import { useResearchosShell } from "@/components/researchos/shell-context"

export function TranslatePanel(props: { resource?: string }) {
  const shell = useResearchosShell()

  const askAgent = () => {
    const target = props.resource ?? "the current paper"
    shell.setPendingPrompt(`@translator Polish the translation of ${target} and check terminology consistency.`)
    shell.setDockOpen(true)
  }

  return (
    <div class="flex h-full flex-col bg-background-base p-4">
      <div class="space-y-4">
        <div>
          <h2 class="text-14-medium text-text-base">Translation</h2>
          <p class="mt-1 text-11-regular text-text-weak">{props.resource ?? "No paper selected"}</p>
        </div>
        <p class="text-12-regular leading-5 text-text-weak">
          Run bilingual translation in the main workspace. The panel lets you hand a translated paper to the agent for polishing.
        </p>
        <div class="flex gap-2">
          <Button size="small" variant="secondary" onClick={askAgent}>Polish with agent</Button>
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
