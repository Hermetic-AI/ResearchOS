import { useNavigate, useParams } from "@solidjs/router"
import { For, createMemo, createResource } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"

export default function Dashboard() {
  const sdk = useSDK(); const platform = usePlatform(); const serverSDK = useServerSDK(); const navigate = useNavigate(); const params = useParams<{ dir: string }>()
  const client = createMemo(() => createResearchosClient({ baseUrl: sdk().url, fetch: platform.fetch, username: serverSDK().server.http.username, password: serverSDK().server.http.password }))
  const [summary] = createResource(() => sdk().directory, async (directory) => {
    const location = { directory }
    const values = await Promise.allSettled([
      client()["server.researchos-literature"].list({ location, limit: 100 }),
      client()["server.researchos-graph"].get({ location }),
      client()["server.researchos-latex"].files({ location }),
      client()["server.researchos-data"].notebooks({ location }),
      client()["server.researchos-plot"].artifacts({ location }),
      client()["server.researchos-reproduce"].list({ location }),
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
  return <main class="h-full overflow-y-auto bg-background-stronger p-6 text-text-base"><div class="mx-auto max-w-6xl"><header class="mb-6"><p class="text-10-medium uppercase tracking-[0.18em] text-text-weak">ResearchOS workspace</p><h1 class="mt-1 text-20-medium">Project cockpit</h1><p class="mt-1 text-11-regular text-text-weak">Live counts come from each module's durable store; unavailable modules are reported honestly.</p></header><div class="grid grid-cols-2 gap-3 lg:grid-cols-4"><For each={summary()} fallback={<p class="text-11-regular text-text-weak">Loading module state…</p>}>{(module, index) => <button class="group min-h-32 rounded-xl border border-border-weak-base bg-background-base p-4 text-left hover:border-border-focus" onClick={() => navigate(`/${params.dir}/${module.route}`)}><div class="flex items-center justify-between"><span class="text-10-medium text-text-weak">0{index() + 1}</span><span class="size-2 rounded-full" classList={{ "bg-icon-success-base": module.count !== undefined, "bg-icon-warning-base": module.count === undefined }} /></div><p class="mt-5 text-14-medium">{module.name}</p><p class="mt-1 text-11-regular text-text-weak">{module.count === undefined ? module.noun : `${module.count} ${module.noun}`}</p></button>}</For></div><section class="mt-6 grid grid-cols-3 gap-3"><Flow title="Discover" text="Literature → graph → cited evidence" /><Flow title="Experiment" text="Notebook → plot → reproducible run" /><Flow title="Publish" text="LaTeX → writing review → translation" /></section></div></main>
}
function Flow(props: { title: string; text: string }) { return <div class="rounded-lg border border-border-weak-base p-3"><p class="text-11-medium">{props.title}</p><p class="mt-1 text-10-regular text-text-weak">{props.text}</p></div> }
