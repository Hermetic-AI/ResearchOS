import { Route, useParams } from "@solidjs/router"
import { createMemo, lazy, Show, Suspense, type ParentProps } from "solid-js"
import { Home } from "@/home/route"
import { ServerProvider } from "@/runtime/server/current"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { SessionPanelFrame, SessionRouteFrame } from "@/session/session-frame"
import { LayoutProvider } from "@/shell/state/layout"
import { SettingsSurfaceProvider } from "@/settings/surface"
import Shell from "@/shell/shell"
import { requireServerKey } from "./session"
import { ExtensionAttachment } from "@/runtime/extension/root"

export const File = lazy(() => import("@opencode/session-ui/file").then((module) => ({ default: module.File })))

const loadSessionRoute = () => Promise.all([import("@/session/route"), File.preload()]).then(([module]) => module)

const DraftRoute = lazy(() => import("@/new-session/route").then((module) => ({ default: module.DraftRoute })))

const SettingsScreen = lazy(() => import("@/settings/shell").then((module) => ({ default: module.SettingsScreen })))

const ConnectServerScreen = lazy(() =>
  import("@/servers/connect/screen").then((module) => ({ default: module.ConnectServerScreen })),
)

const TargetSessionRouteContent = lazy(() =>
  loadSessionRoute().then((module) => ({ default: module.TargetSessionRouteContent })),
)

// researchos:start — 研究模块工作台（10 个页面共用一条路由，页面本身按需加载）
const ResearchosWorkspace = lazy(() =>
  import("@/pages/researchos-workspace").then((module) => ({ default: module.ResearchosWorkspace })),
)

const ResearchosModuleRoute = lazy(() => import("@/pages/researchos-module-route"))
// researchos:end

const researchosPath = /^\/server\/[^/]+\/researchos\/[^/]+(\/[^/]+)?$/

export function preloadRoute(url: string) {
  const pathname = url.split(/[?#]/, 1)[0]

  if (pathname === "/new-session") return DraftRoute.preload().then(() => undefined)

  if (pathname === "/settings") return SettingsScreen.preload().then(() => undefined)

  if (researchosPath.test(pathname))
    return Promise.all([ResearchosWorkspace.preload(), ResearchosModuleRoute.preload()]).then(() => undefined)

  if (/^\/server\/[^/]+\/session\/[^/]+$/.test(pathname))
    return TargetSessionRouteContent.preload().then(() => undefined)

  return Promise.resolve()
}

export function AppRoutes() {
  return (
    <Route component={AppLayout}>
      <Route path="/" component={Home} />
      <Route path="/settings" component={SettingsScreen} />
      <Route
        path="/server/:serverKey/session/:id"
        component={() => (
          <SessionRouteFrame>
            <Suspense
              fallback={
                <div class="flex min-h-0 flex-1 px-[var(--shell-inline-inset,8px)] pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]">
                  <SessionPanelFrame raised />
                </div>
              }
            >
              <TargetServerRoute>
                <TargetSessionRouteContent />
              </TargetServerRoute>
            </Suspense>
          </SessionRouteFrame>
        )}
      />
      {/* researchos:start */}
      <Route path="/server/:serverKey/researchos/:dir" component={ResearchosRouteContent} />
      <Route path="/server/:serverKey/researchos/:dir/:module" component={ResearchosRouteContent} />
      {/* researchos:end */}
      <Route path="/new-session" component={DraftRoute} />
    </Route>
  )
}

function TargetServerRoute(props: ParentProps) {
  const params = useParams<{ serverKey: string }>()
  const global = useGlobal()

  const connection = createMemo(() =>
    global.servers.list().find((item) => ServerConnection.key(item) === requireServerKey(params.serverKey)),
  )

  return (
    <Show when={connection()} keyed>
      {(connection) => <ServerProvider conn={connection}>{props.children}</ServerProvider>}
    </Show>
  )
}

// researchos:start — 模块路由挂在当前服务端下，页面在 ResearchosWorkspace（壳层：
// 上下文面板 / Agent Dock / 状态栏）内按 :module 切换。
function ResearchosRouteContent() {
  return (
    <SessionRouteFrame padded>
      <Suspense fallback={<SessionPanelFrame raised />}>
        <TargetServerRoute>
          <ResearchosWorkspace>
            <ResearchosModuleRoute />
          </ResearchosWorkspace>
        </TargetServerRoute>
      </Suspense>
    </SessionRouteFrame>
  )
}
// researchos:end

function AppLayout(props: ParentProps) {
  const servers = useServers()
  const global = useGlobal()

  // A lone server that rejects our credentials (e.g. the web app before pairing) has nothing else to show.
  const signedOut = () => {
    const only = servers.list.length === 1 ? servers.list[0] : undefined

    if (only?.type !== "http") return

    return global.servers.health[ServerConnection.key(only)]?.unauthorized ? only : undefined
  }

  return (
    <Show when={servers.list.length > 0 && !signedOut()} fallback={<ConnectServerScreen url={signedOut()?.http.url} />}>
      <LayoutProvider>
        <SettingsSurfaceProvider>
          <ExtensionAttachment>
            <Shell>{props.children}</Shell>
          </ExtensionAttachment>
        </SettingsSurfaceProvider>
      </LayoutProvider>
    </Show>
  )
}
