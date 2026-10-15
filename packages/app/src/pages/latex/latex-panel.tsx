import { Button } from "@opencode/ui/button"
import { Show } from "solid-js"
import { useResearchosShell } from "@/components/researchos/shell-context"

export function LatexPanel(props: { resource?: string }) {
  const shell = useResearchosShell()

  const askAgent = () => {
    const file = props.resource ?? "the current paper"
    shell.setPendingPrompt(`@paper-writer Review the LaTeX file ${file} and suggest improvements.`)
    shell.setDockOpen(true)
  }

  return (
    <div class="flex h-full flex-col bg-background-base p-4">
      <div class="space-y-4">
        <div>
          <h2 class="text-14-medium text-text-base">LaTeX Workbench</h2>
          <p class="mt-1 text-11-regular text-text-weak">{props.resource ?? "No file selected"}</p>
        </div>
        <p class="text-12-regular leading-5 text-text-weak">
          The full LaTeX editor is available in the main workspace. Use the panel for quick reviews or to hand the current file to the agent.
        </p>
        <div class="flex gap-2">
          <Button size="small" variant="secondary" onClick={askAgent}>Ask @paper-writer</Button>
        </div>
        <Show when={props.resource}>
          {(file) => (
            <div class="rounded-md border border-border-weak-base bg-background-stronger p-3">
              <p class="font-mono text-10-regular text-text-weaker">{file()}</p>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}
