import { createMemo, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode/util/encode"
import { Icon } from "@opencode/ui/icon"
import { useLayout } from "@/shell/state/layout"
import { useGlobal } from "@/runtime/server/runtime"
import { createResearchosCounts } from "@/components/researchos/counts"
import { decode64 } from "@/runtime/persistence/base64"

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

// 目录解析：研究模块路由自带 base64 目录，直接解出；
// 会话路由回落到该会话 location.directory；主页则回落到主页选中的项目——
// 选中项目后即可直接进入研究模块，无需先建会话。
// 其余页面（设置、连接、草稿）返回 undefined，调用方应隐藏入口。
export function useResearchosDirectory() {
  const layout = useLayout()
  const global = useGlobal()

  return createMemo(() => {
    const route = layout.route()

    if (route.type === "researchos") return decode64(route.dir)
    if (route.type === "session") {
      return global.serverCtx(route.server)?.data.session.get(route.sessionId)?.location.directory
    }
    if (route.type !== "home") return

    return layout.home.selection().directory
  })
}

// 研究模块所属的 server key：模块路由与会话路由自带，主页取选中的项目。
export function useResearchosServer() {
  const layout = useLayout()

  return createMemo(() => {
    const route = layout.route()

    if (route.type === "researchos" || route.type === "session") return route.server
    if (route.type !== "home") return

    return layout.home.selection().server
  })
}

export type ResearchosLink = {
  /** 研究模块地址，path 可带查询串，例如 "graph?paper=xxx" */
  module(path: string): string
  session(sessionID: string): string
}

export function useResearchosLink() {
  const server = useResearchosServer()
  const directory = useResearchosDirectory()

  return createMemo<ResearchosLink | undefined>(() => {
    const current = server()
    const dir = directory()

    if (!current || !dir) return
    const base = `/server/${base64Encode(current)}`

    return {
      module: (path) => `${base}/researchos/${base64Encode(dir)}/${path}`,
      session: (sessionID) => `${base}/session/${sessionID}`,
    }
  })
}

// 当前项目下各模块的跳转地址；目录或服务端未知时返回 undefined，调用方应隐藏入口。
export function useResearchosHref() {
  const link = useResearchosLink()

  return createMemo(() => {
    const current = link()

    if (!current) return

    return (module: string) => current.module(module)
  })
}

// 原生侧栏用的带文字模块列表：让研究模块与会话同层可见、一键直达。
// 会话页的模块切换由标题栏 ResearchosModulesMenu 承担，避免导航重复。
export function ResearchosModuleList() {
  const href = useResearchosHref()
  const directory = useResearchosDirectory()
  const layout = useLayout()
  const navigate = useNavigate()
  const counts = createResearchosCounts(directory)

  return (
    <Show when={href()}>
      {(to) => (
        <nav class="px-2 pb-2" aria-label="ResearchOS modules">
          <p class="px-2 pb-1 pt-2 text-10-medium uppercase tracking-wide text-text-weaker">Research</p>
          <For each={researchosModules}>
            {(m) => {
              const active = createMemo(() => {
                const route = layout.route()

                return route.type === "researchos" && route.module === m.route
              })
              // aria-hidden keeps the button's accessible name ("Literature") stable for e2e
              return (
                <button
                  class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-12-medium transition-colors hover:bg-surface-raised-base-hover"
                  classList={{
                    "bg-background-selected text-text-strong": active(),
                    "text-text-weak": !active(),
                  }}
                  onClick={() => navigate(to()(m.route))}
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
