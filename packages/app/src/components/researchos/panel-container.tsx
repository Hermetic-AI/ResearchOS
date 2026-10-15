import { Icon } from "@opencode-ai/ui/icon"
import { Match, Show, Switch, createSignal, type ParentProps } from "solid-js"
import { useResearchosShell } from "./shell-context"
import { LiteraturePanel } from "@/pages/literature/literature-panel"
import { GraphPanel } from "@/pages/graph/graph-panel"
import { LatexPanel } from "@/pages/latex/latex-panel"
import { DataPanelEmbed } from "@/pages/data/data-panel-embed"
import { PlotPanel } from "@/pages/plot/plot-panel"
import { ReproducePanel } from "@/pages/researchos-reproduce-panel"
import { TranslatePanel } from "@/pages/researchos-translate-panel"

export function PanelContainer(props: ParentProps) {
  const shell = useResearchosShell()
  const [panelOpen, setPanelOpen] = createSignal(true)

  const modulePanel = () => shell.modulePanel()
  const customPanel = () => shell.panel()

  const close = () => {
    shell.setModulePanel(undefined)
    shell.setContextPanel(undefined)
  }

  const hasPanel = () => !!modulePanel() || !!customPanel()

  return (
    <div class="flex size-full min-h-0 min-w-0">
      <section class="flex min-h-0 min-w-0 flex-1 [&>*]:w-full">{props.children}</section>
      <Show when={hasPanel()}>
        <>
          <Show when={!panelOpen()}>
            <button
              class="flex w-6 shrink-0 items-center justify-center border-l border-border-weak-base bg-background-base text-text-weak transition-colors hover:bg-background-selected hover:text-text-base"
              onClick={() => setPanelOpen(true)}
              aria-label="Expand panel"
            >
              <Icon name="chevron-left" size="small" />
            </button>
          </Show>
          <aside
            class="shrink-0 overflow-hidden border-l border-border-weak-base bg-background-base transition-[width] duration-200"
            classList={{
              "w-[360px]": panelOpen(),
              "w-0 border-l-0": !panelOpen(),
            }}
          >
            <div class="flex h-full w-[360px] flex-col">
              <div class="flex h-9 shrink-0 items-center justify-between border-b border-border-weak-base px-3">
                <p class="text-11-medium text-text-weak">
                  {modulePanel()?.module ?? "Context"}
                </p>
                <button
                  class="flex size-6 items-center justify-center rounded-md text-text-weak hover:bg-background-selected hover:text-text-base"
                  onClick={close}
                  aria-label="Close panel"
                >
                  <Icon name="close-small" size="small" />
                </button>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto">
                <Show when={modulePanel()} fallback={customPanel()}>
                  {(panel) => (
                    <Switch>
                      <Match when={panel().module === "literature"}>
                        <LiteraturePanel paperId={panel().resource} />
                      </Match>
                      <Match when={panel().module === "graph"}>
                        <GraphPanel nodeId={panel().resource} />
                      </Match>
                      <Match when={panel().module === "latex"}>
                        <LatexPanel resource={panel().resource} />
                      </Match>
                      <Match when={panel().module === "data"}>
                        <DataPanelEmbed resource={panel().resource} />
                      </Match>
                      <Match when={panel().module === "plot"}>
                        <PlotPanel resource={panel().resource} />
                      </Match>
                      <Match when={panel().module === "reproduce"}>
                        <ReproducePanel resource={panel().resource} />
                      </Match>
                      <Match when={panel().module === "translate"}>
                        <TranslatePanel resource={panel().resource} />
                      </Match>
                      <Match when={true}>{customPanel()}</Match>
                    </Switch>
                  )}
                </Show>
              </div>
            </div>
          </aside>
        </>
      </Show>
    </div>
  )
}
