import type { ParentProps } from "solid-js"
import { AgentDock } from "@/components/researchos/agent-dock"
import { createResearchosHealth } from "@/components/researchos/health"
import { PanelContainer } from "@/components/researchos/panel-container"
import { ResearchosShellProvider } from "@/components/researchos/shell-context"
import { StatusBar } from "@/components/researchos/status-bar"

export function ResearchosWorkspace(props: ParentProps) {
  return (
    <ResearchosShellProvider>
      <ResearchosShell>{props.children}</ResearchosShell>
    </ResearchosShellProvider>
  )
}

// 研究模块不再自带左侧导航：模块切换与会话列表由原生侧栏
// （窄栏 ResearchosModuleRail / 宽栏 ResearchosModuleList / 会话面板）承担，
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
