import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { researchosModules } from "@/components/researchos-rail"
import { useResearchosShell } from "./shell-context"
import type { PanelDirective } from "./panel-protocol"

export function PanelCard(props: { directive: PanelDirective }) {
  const shell = useResearchosShell()
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()
  const module = () => researchosModules.find((item) => item.route === props.directive.panel)
  const openPanel = () => {
    shell.setModulePanel({ module: props.directive.panel, resource: props.directive.resource })
  }
  const openFullPage = () => {
    const route = module()?.route ?? props.directive.panel
    const query = props.directive.resource ? `?${props.directive.panel === "graph" ? "node" : "paper"}=${encodeURIComponent(props.directive.resource)}` : ""
    navigate(`/${params.dir}/${route}${query}`)
  }

  return (
    <div class="my-2 rounded-lg border border-border-weak-base bg-background-base p-3">
      <div class="flex items-center gap-2">
        <Icon name={module()?.icon ?? "prompt"} size="small" />
        <span class="text-11-medium text-text-base">{module()?.label ?? props.directive.panel}</span>
        <Show when={props.directive.resource}>
          {(resource) => <span class="font-mono text-10-regular text-text-weaker">{resource()}</span>}
        </Show>
      </div>
      <div class="mt-2 flex items-center gap-2">
        <Button size="small" variant="secondary" onClick={openPanel}>在面板中查看</Button>
        <Button size="small" variant="ghost" onClick={openFullPage}>全页打开</Button>
      </div>
    </div>
  )
}
