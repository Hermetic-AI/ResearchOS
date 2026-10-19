import { createSimpleContext } from "@opencode/ui/context"
import { createSignal, type JSX } from "solid-js"

export type ResearchosAgentContext = {
  readonly module: string
  readonly resource?: string
}

export type ResearchosModulePanel = {
  readonly module: string
  readonly resource?: string
}

export const { use: useResearchosShell, provider: ResearchosShellProvider } = createSimpleContext({
  name: "ResearchosShell",
  init: () => {
    const [panel, setPanel] = createSignal<JSX.Element>()
    const [agent, setAgent] = createSignal<ResearchosAgentContext>()
    const [dockOpen, setDockOpen] = createSignal(false)
    const [pendingPrompt, setPendingPrompt] = createSignal("")
    const [modulePanel, setModulePanel] = createSignal<ResearchosModulePanel>()

    return {
      panel,
      setContextPanel: setPanel,
      agent,
      setAgentContext: setAgent,
      dockOpen,
      setDockOpen,
      pendingPrompt,
      setPendingPrompt,
      modulePanel,
      setModulePanel,
    }
  },
})
