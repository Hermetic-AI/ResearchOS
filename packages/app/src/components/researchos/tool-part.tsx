import { PART_MAPPING } from "@opencode-ai/session-ui/message-part"
import type { MessagePartProps } from "@opencode-ai/session-ui/message-part"
import { createMemo, Show } from "solid-js"
import { PanelCard } from "./panel-card"
import { parsePanelDirective } from "./panel-protocol"
import { ToolMissingCard } from "./tool-missing-card"

const originalToolPart = PART_MAPPING["tool"]

export function ResearchosToolPart(props: MessagePartProps) {
  const directive = createMemo(() => {
    const part = props.part as { state?: { metadata?: unknown; output?: unknown } }
    const metadata = part.state?.metadata
    const output = typeof part.state?.output === "string" ? part.state.output : undefined
    return parsePanelDirective(metadata, output)
  })

  const missingTool = createMemo(() => {
    const part = props.part as { state?: { status?: string; error?: unknown; metadata?: unknown } }
    if (part.state?.status !== "error") return undefined
    const error = typeof part.state.error === "string" ? part.state.error : ""
    if (!error.includes("MCP") && !error.includes("not found") && !error.includes("not connected")) return undefined
    const tool = "tool" in props.part && typeof props.part.tool === "string" ? props.part.tool : "unknown"
    return { tool, error }
  })

  return (
    <>
      <Show when={directive()}>{(value) => <PanelCard directive={value()} />}</Show>
      <Show when={missingTool()}>{(value) => <ToolMissingCard tool={value().tool} error={value().error} />}</Show>
      <Show when={originalToolPart} fallback={<div class="text-text-weak">Unknown tool part</div>}>
        {(component) => {
          const Component = component()
          return <Component {...props} />
        }}
      </Show>
    </>
  )
}

// Register the wrapper so every tool result is inspected for researchos.ui
// directives. The registration happens at module load time; any session page
// that imports this module will render panel cards automatically.
export function registerResearchosToolPart() {
  PART_MAPPING["tool"] = ResearchosToolPart
}
