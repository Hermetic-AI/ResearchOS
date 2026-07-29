import { useNavigate, useParams } from "@solidjs/router"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"

export const researchosModules = [
  { icon: "models" as const, label: "Overview", route: "overview" },
  { icon: "checklist" as const, label: "Literature", route: "literature" },
  { icon: "brain" as const, label: "Knowledge Graph", route: "graph" },
  { icon: "prompt" as const, label: "LaTeX Editor", route: "latex" },
  { icon: "task" as const, label: "Data Analysis", route: "data" },
  { icon: "sliders" as const, label: "Plot Center", route: "plot" },
  { icon: "code" as const, label: "Code Reproduce", route: "reproduce" },
  { icon: "glasses" as const, label: "Translation", route: "translate" },
  { icon: "subagent" as const, label: "Asset Center", route: "assets" },
]

export function ResearchosModuleRail() {
  const navigate = useNavigate()
  const params = useParams<{ dir: string }>()

  return (
    <div class="flex flex-col items-center gap-2 py-2">
      <div class="w-10 h-px bg-border-base" />
      {researchosModules.map((m) => (
        <Tooltip placement="right" value={m.label}>
          <IconButton
            icon={m.icon}
            variant="ghost"
            size="small"
            onClick={() => navigate(`/${params.dir}/${m.route}`)}
            aria-label={m.label}
          />
        </Tooltip>
      ))}
    </div>
  )
}
