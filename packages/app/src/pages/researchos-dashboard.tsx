import { useNavigate } from "@solidjs/router"
import { For, Show, createEffect, createMemo, createResource, onCleanup } from "solid-js"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { useResearchosDirectory, useResearchosLink, type ResearchosLink } from "@/components/researchos-rail"
import { createResearchosClient } from "@/utils/researchos-client"
import { StatusBadge } from "@/components/researchos/module-state"
import { useResearchosShell } from "@/components/researchos/shell-context"

export default function Dashboard() {
  const directory = useResearchosDirectory()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const navigate = useNavigate()
  const link = useResearchosLink()
  const shell = useResearchosShell()
  const client = createMemo(() => createResearchosClient({ baseUrl: serverSDK.url, fetch: platform.fetch, password: serverSDK.server.http.password }))
  createEffect(() => { shell.setAgentContext({ module: "overview" }) })
  onCleanup(() => shell.setAgentContext(undefined))

  const [summary] = createResource(() => directory(), async (directory) => {
    const location = { directory }
    const values = await Promise.allSettled([
      client()["server.researchos-literature"].literature.list({ location, limit: 100 }),
      client()["server.researchos-graph"].graph.get({ location }),
      client()["server.researchos-latex"].latex.files({ location }),
      client()["server.researchos-data"].data.notebooks({ location }),
      client()["server.researchos-plot"].plot.artifacts({ location }),
      client()["server.researchos-reproduce"].reproduce.list({ location }),
    ])
    const count = (index: number, select: (data: unknown) => number) => values[index]?.status === "fulfilled" ? select(values[index].value.data) : undefined
    return [
      { name: "Literature", route: "literature", count: count(0, (data) => (data as unknown[]).length), noun: "papers" },
      { name: "Knowledge graph", route: "graph", count: count(1, (data) => (data as { nodes: unknown[] }).nodes.length), noun: "nodes" },
      { name: "LaTeX editor", route: "latex", count: count(2, (data) => (data as { files: unknown[] }).files.length), noun: "sources" },
      { name: "Data analysis", route: "data", count: count(3, (data) => (data as unknown[]).length), noun: "notebooks" },
      { name: "Plot studio", route: "plot", count: count(4, (data) => (data as unknown[]).length), noun: "artifacts" },
      { name: "Code reproduction", route: "reproduce", count: count(5, (data) => (data as unknown[]).length), noun: "runs" },
      { name: "Translation", route: "translate", noun: "on demand" },
      { name: "Asset center", route: "assets", noun: "agents · skills · commands" },
    ]
  })
  const isEmpty = createMemo(() => {
    const data = summary()
    if (!data) return false
    const core = data.slice(0, 6)
    return core.every((item) => item.count === 0)
  })
  return <main class="h-full overflow-y-auto bg-background-stronger p-6 text-text-base"><div class="mx-auto max-w-6xl"><header class="mb-6"><p class="text-10-medium uppercase tracking-[0.18em] text-text-weak">ResearchOS workspace</p><h1 class="mt-1 text-20-medium">Project cockpit</h1><p class="mt-1 text-11-regular text-text-weak">Live counts come from each module's durable store; unavailable modules are reported honestly.</p></header><Show when={isEmpty()}><WelcomeCard link={link()!} /></Show><div class="grid grid-cols-2 gap-3 lg:grid-cols-4"><For each={summary()} fallback={<p class="text-11-regular text-text-weak">Loading module state…</p>}>{(module, index) => <button class="group min-h-32 rounded-xl border border-border-weak-base bg-background-base p-4 text-left hover:border-border-focus" onClick={() => navigate(link()!.module(module.route))}><div class="flex items-center justify-between"><span class="text-10-medium text-text-weak">0{index() + 1}</span><ModuleBadge module={module} /></div><p class="mt-5 text-14-medium">{module.name}</p><p class="mt-1 text-11-regular text-text-weak">{module.count === undefined ? module.noun : `${module.count} ${module.noun}`}</p></button>}</For></div><section class="mt-6 grid grid-cols-3 gap-3"><Flow title="Discover" text="Literature → graph → cited evidence" /><Flow title="Experiment" text="Notebook → plot → reproducible run" /><Flow title="Publish" text="LaTeX → writing review → translation" /></section></div></main>
}

function WelcomeCard(props: { link: ResearchosLink }) {
  const navigate = useNavigate()
  return <section class="mb-6 rounded-xl border border-border-weak-base bg-background-base p-5"><p class="text-14-medium text-text-base">Start your first research project</p><p class="mt-1 text-12-regular text-text-weak">Import papers, build a knowledge graph, and let the conversation drive the modules.</p><div class="mt-4 grid grid-cols-3 gap-3"><ActionCard title="Import first papers" description="Drag PDFs into the chat or search arXiv." onClick={() => navigate(props.link.module("literature"))} /><ActionCard title="See what it can do" description="Browse the asset center for agents and skills." onClick={() => navigate(props.link.module("assets"))} /><ActionCard title="Quick note" description="Capture thoughts and link them to papers." onClick={() => navigate(props.link.module("notes"))} /></div></section>
}

function ActionCard(props: { title: string; description: string; onClick: () => void }) {
  return <button class="rounded-lg border border-border-weak-base p-4 text-left hover:border-border-focus hover:bg-surface-base-hover" onClick={props.onClick}><p class="text-12-medium text-text-base">{props.title}</p><p class="mt-1 text-11-regular text-text-weak">{props.description}</p></button>
}
function Flow(props: { title: string; text: string }) { return <div class="rounded-lg border border-border-weak-base p-3"><p class="text-11-medium">{props.title}</p><p class="mt-1 text-10-regular text-text-weak">{props.text}</p></div> }
function ModuleBadge(props: { module: { count?: number; noun: string } }) {
  if (props.module.count !== undefined) return <StatusBadge status="ok" label={`${props.module.count} ${props.module.noun}`} />
  if ("count" in props.module) return <StatusBadge status="fail" label={props.module.noun} detail="Module unavailable" />
  return <StatusBadge status="off" label={props.module.noun} />
}
