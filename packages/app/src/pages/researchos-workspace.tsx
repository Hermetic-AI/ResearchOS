import { createEffect, type ParentProps } from "solid-js"
import { AgentDock } from "@/components/researchos/agent-dock"
import { createResearchosHealth } from "@/components/researchos/health"
import { PanelContainer } from "@/components/researchos/panel-container"
import { ResearchosShellProvider } from "@/components/researchos/shell-context"
import { StatusBar } from "@/components/researchos/status-bar"
import { ensureResearchosProject } from "@/components/researchos/project-init"
import { useResearchosDirectory, useResearchosServer } from "@/components/researchos-rail"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { usePlatform } from "@/runtime/platform/platform"
import { showToast } from "@/shell/notifications/toast"

const seeded = new Set<string>()

export function ResearchosWorkspace(props: ParentProps) {
  const directory = useResearchosDirectory()
  const serverKey = useResearchosServer()
  const servers = useServers()
  const platform = usePlatform()

  // Modules expect the ResearchOS preset (agents, skills, MCP) before their tools work.
  createEffect(() => {
    const dir = directory()
    if (!dir || seeded.has(dir)) return
    const conn = servers.list.find((item) => ServerConnection.key(item) === serverKey())
    if (!conn) return
    seeded.add(dir)
    void ensureResearchosProject({ directory: dir, conn, fetch: platform.fetch }).then((result) => {
      if (!result.error) return
      seeded.delete(dir)
      showToast({ title: "ResearchOS preset install failed", description: result.error, variant: "error" })
    })
  })

  return (
    <ResearchosShellProvider>
      <ResearchosShell>{props.children}</ResearchosShell>
    </ResearchosShellProvider>
  )
}

// 研究模块不再自带左侧导航：模块切换与会话列表由原生侧栏
// （宽栏 ResearchosModuleList）与标题栏菜单承担，
// 这里只保留工作区、右侧上下文面板、Agent Dock 与状态栏。
function ResearchosShell(props: ParentProps) {
  const health = createResearchosHealth()

  return (
    <div class="flex size-full min-h-0 min-w-0 flex-col bg-background-base text-text-base">
      <PanelContainer>{props.children}</PanelContainer>
      <AgentDock />
      <StatusBar health={health} />
    </div>
  )
}
