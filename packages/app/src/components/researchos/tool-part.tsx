import { addToolPartDecorator, type ToolProps } from "@opencode/session-ui/message-part"
import { Show } from "solid-js"
import { PanelCard } from "./panel-card"
import { parsePanelDirective } from "./panel-protocol"
import { ToolMissingCard } from "./tool-missing-card"

type Decorated = ToolProps & { id: string; error?: string }

// A tool error only means "the MCP server is missing" when the message says so;
// other failures are rendered by the upstream error card.
const missingTool = (props: Decorated) => {
  if (props.status !== "error") return undefined
  const error = typeof props.error === "string" ? props.error : ""
  if (!error.includes("MCP") && !error.includes("not found") && !error.includes("not connected")) return undefined
  return { tool: props.tool || "unknown", error }
}

// Decorates every tool part so researchos.ui directives render their panel card and a
// missing MCP tool gets a fix-it card. Upstream ToolDisplay still renders the tool itself.
export function registerResearchosToolPart() {
  return addToolPartDecorator((props) => {
    const directive = parsePanelDirective(props.metadata, props.output)
    const missing = missingTool(props)
    return (
      <>
        <Show when={directive}>{(value) => <PanelCard directive={value()} />}</Show>
        <Show when={missing}>{(value) => <ToolMissingCard tool={value().tool} error={value().error} />}</Show>
      </>
    )
  })
}
