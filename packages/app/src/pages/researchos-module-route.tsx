import { lazy, Suspense } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useParams } from "@solidjs/router"
import { ModuleState } from "@/components/researchos/module-state"

const Dashboard = lazy(() => import("@/pages/researchos-dashboard"))
const LiteraturePage = lazy(() => import("@/pages/researchos-literature"))
const GraphPage = lazy(() => import("@/pages/researchos-graph"))
const LatexPage = lazy(() => import("@/pages/researchos-latex"))
const DataPage = lazy(() => import("@/pages/researchos-data"))
const PlotPage = lazy(() => import("@/pages/researchos-plot"))
const ReproducePage = lazy(() => import("@/pages/researchos-reproduce"))
const TranslatePage = lazy(() => import("@/pages/researchos-translate"))
const NotesPage = lazy(() => import("@/pages/researchos-notes"))
const AssetsPage = lazy(() => import("@/pages/researchos-assets"))

const pages = {
  overview: Dashboard,
  literature: LiteraturePage,
  graph: GraphPage,
  latex: LatexPage,
  data: DataPage,
  plot: PlotPage,
  reproduce: ReproducePage,
  translate: TranslatePage,
  notes: NotesPage,
  assets: AssetsPage,
}

// One route for every research module (/server/:key/researchos/:dir/:module):
// the route table stays static while the page itself loads lazily per module.
export default function ResearchosModuleRoute() {
  const params = useParams<{ module: string }>()
  const page = () => pages[params.module as keyof typeof pages] ?? Dashboard

  return (
    <Suspense fallback={<ModuleState state="running" title="Loading module…" description="Fetching this module from the local server." />}>
      <Dynamic component={page()} />
    </Suspense>
  )
}
