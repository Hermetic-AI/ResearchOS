import { createMemo, For, Show } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useLayout } from "@/context/layout"
import { useServerSync } from "@/context/server-sync"
import { createResearchosCounts } from "@/components/researchos/counts"
import { decode64 } from "@/utils/base64"

export const researchosModules = [
  { icon: "models" as const, label: "Overview", route: "overview", description: "Live snapshot of every research module in this project." },
  { icon: "checklist" as const, label: "Literature", route: "literature", description: "Import, search, and manage the papers in your library." },
  { icon: "brain" as const, label: "Knowledge Graph", route: "graph", description: "Explore papers, notes, and concepts as a linked graph." },
  { icon: "prompt" as const, label: "LaTeX Editor", route: "latex", description: "Write, compile, and review LaTeX manuscripts." },
  { icon: "task" as const, label: "Data Analysis", route: "data", description: "Run notebooks against project datasets in a sandboxed kernel." },
  { icon: "sliders" as const, label: "Plot Center", route: "plot", description: "Create reproducible, publication-ready figures." },
  { icon: "code" as const, label: "Code Reproduce", route: "reproduce", description: "Reproduce experiments from papers and repositories." },
  { icon: "glasses" as const, label: "Translation", route: "translate", description: "Translate academic papers with protected formulas." },
  { icon: "bullet-list" as const, label: "Quick Notes", route: "notes", description: "Capture thoughts and link them to papers." },
  { icon: "subagent" as const, label: "Asset Center", route: "assets", description: "Manage agents, skills, and commands for this project." },
]

// 目录解析：优先当前路径（/:dir/<module> 或 /:dir/session/…），
// 再从新布局会话路由（/server/:serverKey/session/:id）的 Session 记录兜底，
// 最后回落到主页当前选中的项目——主页选中项目后即可进入研究模块，无需先建会话。
// 其余项目无关页面返回 undefined，调用方应隐藏入口。
export function useResearchosDirectory() {
  const location = useLocation()
  const layout = useLayout()
  const sync = useServerSync()
  return createMemo(() => {
    const fromPath = decode64(location.pathname.split("/").filter(Boolean)[0] ?? "")
    if (fromPath) return fromPath
    const route = layout.route()
    if (route.type === "dir-new-sesssion") return route.dir
    if (route.type === "session") return sync().session.get(route.sessionId)?.directory
    if (route.type !== "home") return undefined
    return layout.home.selection().directory
  })
}

// 旧布局窄侧栏（w-16 图标列）的模块入口：空间只够图标，名称与说明放在 tooltip。
// 宽侧栏面板用 ResearchosModuleList，主页用 ResearchosModuleRailV2，
// 会话页用标题栏 ResearchosModulesMenu——每个场景一种形态，数据源同为 researchosModules。
export function ResearchosModuleRail() {
  const navigate = useNavigate()
  const location = useLocation()
  const directory = useResearchosDirectory()

  return (
    <Show when={directory()}>
      <nav class="flex w-full flex-col items-center gap-2 border-t border-border-base py-2" aria-label="ResearchOS modules">
        <For each={researchosModules}>
          {(m) => (
            <Tooltip placement="right" value={`${m.label} — ${m.description}`}>
              <IconButton
                icon={m.icon}
                variant={location.pathname.endsWith(`/${m.route}`) ? "secondary" : "ghost"}
                size="small"
                onClick={() => navigate(`/${base64Encode(directory()!)}/${m.route}`)}
                aria-label={m.label}
              />
            </Tooltip>
          )}
        </For>
      </nav>
    </Show>
  )
}

// 新布局主页的模块 rail：选中项目后直接点亮研究模块入口，无需先建会话。
// 只在主页路由渲染——/:dir/* 工作台页面由旧侧栏的 ResearchosModuleList 承担，
// 会话页由标题栏 ResearchosModulesMenu 承担，避免导航重复。
export function ResearchosModuleRailV2() {
  const navigate = useNavigate()
  const location = useLocation()
  const directory = useResearchosDirectory()
  const atHome = () => location.pathname === "/"

  return (
    <Show when={atHome() && directory()}>
      <nav
        class="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-v2-border-border-muted py-2"
        aria-label="ResearchOS modules"
      >
        <For each={researchosModules}>
          {(m) => (
            <TooltipV2 placement="right" value={`${m.label} — ${m.description}`}>
              <IconButtonV2
                type="button"
                variant={location.pathname.endsWith(`/${m.route}`) ? "neutral" : "ghost-muted"}
                size="normal"
                icon={<Icon name={m.icon} size="small" />}
                aria-label={m.label}
                onClick={() => navigate(`/${base64Encode(directory()!)}/${m.route}`)}
              />
            </TooltipV2>
          )}
        </For>
      </nav>
    </Show>
  )
}

// 原生侧栏面板用的带文字模块列表：让研究模块与会话同层可见、一键直达
export function ResearchosModuleList(props: { directory?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fallback = useResearchosDirectory()
  const directory = () => props.directory ?? fallback()
  const counts = createResearchosCounts(directory)

  return (
    <Show when={directory()}>
      {(dir) => (
        <nav class="px-2 pb-2" aria-label="ResearchOS modules">
          <p class="px-2 pb-1 pt-2 text-10-medium uppercase tracking-wide text-text-weaker">Research</p>
          <For each={researchosModules}>
            {(m) => {
              const active = () => location.pathname.endsWith(`/${m.route}`)
              // aria-hidden keeps the button's accessible name ("Literature") stable for e2e
              return (
                <button
                  class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-12-medium transition-colors hover:bg-surface-raised-base-hover"
                  classList={{
                    "bg-background-selected text-text-strong": active(),
                    "text-text-weak": !active(),
                  }}
                  onClick={() => navigate(`/${base64Encode(dir())}/${m.route}`)}
                >
                  <Icon name={m.icon} size="small" />
                  <span>{m.label}</span>
                  <Show when={counts()?.[m.route] !== undefined}>
                    <span aria-hidden="true" class="ml-auto font-mono text-10-regular text-text-weaker">
                      {counts()?.[m.route]}
                    </span>
                  </Show>
                </button>
              )
            }}
          </For>
        </nav>
      )}
    </Show>
  )
}
