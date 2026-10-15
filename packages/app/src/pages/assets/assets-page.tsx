import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tag } from "@opencode-ai/ui/tag"
import { useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { ModuleState, StatusBadge } from "@/components/researchos/module-state"
import { useResearchosShell } from "@/components/researchos/shell-context"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { formatServerError } from "@/utils/server-errors"
import { createAssetClient } from "./api"
import { ApiPanel } from "./api-panel"

type PanelId = "skill" | "mcp" | "model" | "agent" | "command" | "rules" | "plugin" | "api"

type SourceKey = "skills" | "agents" | "commands" | "models" | "providers" | "mcp" | "config" | "rules" | "api" | "apiStats"
type SourceState = { readonly status: "ready" | "error"; readonly error?: string }

const sourceNames: Record<SourceKey, string> = {
  skills: "GET /api/skill",
  agents: "GET /api/agent",
  commands: "GET /api/command",
  models: "GET /api/model",
  providers: "GET /api/provider",
  mcp: "GET /mcp",
  config: "GET /config",
  rules: "AGENTS.md load chain",
  api: "GET /api/researchos-assets/api",
  apiStats: "GET /api/researchos-assets/api/stats",
}

const panelSources: Record<PanelId, ReadonlyArray<SourceKey>> = {
  skill: ["skills"],
  mcp: ["mcp"],
  model: ["models", "providers"],
  agent: ["agents"],
  command: ["commands"],
  rules: ["rules"],
  plugin: ["config"],
  api: ["api", "apiStats"],
}

const settledValue = <T,>(result: PromiseSettledResult<T>): T | undefined => (result.status === "fulfilled" ? result.value : undefined)

const sourceState = (result: PromiseSettledResult<unknown>): SourceState =>
  result.status === "fulfilled" ? { status: "ready" } : { status: "error", error: formatServerError(result.reason) }

const panels: Array<{ readonly id: PanelId; readonly label: string; readonly source: string }> = [
  { id: "skill", label: "Skills", source: "GET /api/skill" },
  { id: "mcp", label: "MCP Servers", source: "GET /mcp" },
  { id: "model", label: "Models", source: "GET /api/model · /api/provider" },
  { id: "agent", label: "SubAgents", source: "GET /api/agent" },
  { id: "command", label: "Commands", source: "GET /api/command" },
  { id: "rules", label: "Rules", source: "AGENTS.md load chain" },
  { id: "plugin", label: "Hooks & Plugins", source: "GET /config" },
  { id: "api", label: "API Hub", source: "GET /api/researchos-assets/api" },
]

export default function AssetsPage() {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const [search, setSearch] = useSearchParams<{ tab?: string }>()
  const active = createMemo<PanelId>(() => panels.some((panel) => panel.id === search.tab) ? search.tab as PanelId : "skill")
  const assetClient = createMemo(() => createAssetClient({
    baseUrl: sdk().url,
    fetch: platform.fetch,
    username: serverSDK().server.http.username,
    password: serverSDK().server.http.password,
  }))
  const [snapshot, snapshotActions] = createResource(
    () => sdk().directory,
    async (directory) => {
      const client = sdk().client
      const assetApi = assetClient()["server.researchos-assets"]
      const [skills, agents, commands, models, providers, mcp, config, rules, api, apiStats] = await Promise.allSettled([
        client.v2.skill.list(),
        client.v2.agent.list(),
        client.v2.command.list(),
        client.v2.model.list(),
        client.v2.provider.list(),
        client.mcp.status(),
        client.config.get(),
        assetApi.fileRead({
          location: { directory },
          kind: "rules",
          scope: "project",
        }),
        assetApi.list({ location: { directory } }),
        assetApi.stats({ location: { directory } }),
      ])

      return {
        sources: {
          skills: sourceState(skills),
          agents: sourceState(agents),
          commands: sourceState(commands),
          models: sourceState(models),
          providers: sourceState(providers),
          mcp: sourceState(mcp),
          config: sourceState(config),
          rules: sourceState(rules),
          api: sourceState(api),
          apiStats: sourceState(apiStats),
        },
        skills: settledValue(skills)?.data?.data ?? [],
        agents: settledValue(agents)?.data?.data ?? [],
        commands: settledValue(commands)?.data?.data ?? [],
        models: settledValue(models)?.data?.data ?? [],
        providers: settledValue(providers)?.data?.data ?? [],
        mcp: settledValue(mcp)?.data ?? {},
        plugins: settledValue(config)?.data?.plugin ?? [],
        rules: settledValue(rules)?.data ?? { path: "AGENTS.md", content: "", chain: [] },
        api: settledValue(api)?.data ?? [],
        apiStats: settledValue(apiStats)?.data ?? [],
      }
    },
  )
  const counts = createMemo<Record<PanelId, number>>(() => ({
    skill: snapshot()?.skills.length ?? 0,
    mcp: Object.keys(snapshot()?.mcp ?? {}).length,
    model: snapshot()?.models.length ?? 0,
    agent: snapshot()?.agents.filter((agent) => agent.mode !== "primary").length ?? 0,
    command: snapshot()?.commands.length ?? 0,
    rules: snapshot()?.rules.chain.filter((entry) => entry.exists).length ?? 0,
    plugin: snapshot()?.plugins.length ?? 0,
    api: snapshot()?.api.length ?? 0,
  }))
  const [editor, setEditor] = createSignal<EditorState>({ open: false, kind: "skill", name: "", content: "", scope: "project", mode: "create" })
  const openEditor = (kind: EditorKind, mode: "create" | "edit", name = "", content = "") => setEditor({ open: true, kind, name, content, scope: "project", mode })
  const closeEditor = () => setEditor((e) => ({ ...e, open: false }))
  const failedMcp = createMemo(() => Object.values(snapshot()?.mcp ?? {}).some((item) => item.status === "failed"))
  const failedAdapters = createMemo(() => (snapshot()?.apiStats ?? []).some((item) => item.state === "failed"))
  const failedSources = (panel: PanelId) => panelSources[panel].filter((key) => snapshot()?.sources[key].status === "error")
  const navStatus = (panel: PanelId): { status: "ok" | "degraded" | "fail" | "off" | "unknown"; label: string; detail?: string } => {
    if (!snapshot() && snapshot.loading) return { status: "unknown", label: "probing" }
    const failed = failedSources(panel)
    if (failed.length > 0) return { status: "fail", label: "error", detail: `${failed.map((key) => sourceNames[key]).join(" · ")} failed` }
    if (panel === "mcp" && failedMcp()) return { status: "degraded", label: "degraded", detail: "Some MCP servers failed to connect" }
    if (panel === "api" && failedAdapters()) return { status: "degraded", label: "degraded", detail: "Some API adapters are failing" }
    if (counts()[panel] === 0) return { status: "off", label: "empty" }
    return { status: "ok", label: "ok" }
  }
  const shell = useResearchosShell()
  createEffect(() => shell.setAgentContext({ module: "assets", resource: active() }))
  onCleanup(() => shell.setAgentContext(undefined))
  const testApi = async (name: string) => {
    const result = await assetClient()["server.researchos-assets"].test({
      location: { directory: sdk().directory },
      name,
    })
    await snapshotActions.refetch()
    return result.data
  }

  return (
    <div class="flex h-full min-h-0 bg-background-base">
      <aside class="w-44 shrink-0 border-r border-border-weaker-base bg-background-stronger px-3 py-5 sm:w-56">
        <div class="px-2 pb-4">
          <p class="text-14-medium text-text-base">Research environment</p>
          <p class="mt-1 text-11-regular text-text-weak">Live project assets, not a separate registry</p>
        </div>
        <nav aria-label="Asset types" class="flex flex-col gap-1">
          <For each={panels}>
            {(panel) => (
              <button
                type="button"
                aria-current={active() === panel.id ? "page" : undefined}
                class="group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-12-medium outline-none transition-colors hover:bg-surface-base-hover focus-visible:ring-1 focus-visible:ring-border-focus"
                classList={{ "bg-surface-base-hover text-text-base": active() === panel.id, "text-text-weak": active() !== panel.id }}
                onClick={() => setSearch({ tab: panel.id })}
              >
                <StatusBadge
                  status={navStatus(panel.id).status}
                  label={navStatus(panel.id).label}
                  detail={navStatus(panel.id).detail}
                />
                <span class="min-w-0 flex-1 truncate">{panel.label}</span>
                <span class="font-mono text-10-regular text-text-weak">{counts()[panel.id]}</span>
              </button>
            )}
          </For>
        </nav>
      </aside>

      <main class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto flex w-full max-w-5xl flex-col gap-5 px-7 py-6">
          <header class="flex items-start justify-between gap-4 border-b border-border-weaker-base pb-5">
            <div>
              <p class="font-mono text-10-medium uppercase tracking-wider text-text-weak">{panels.find((panel) => panel.id === active())?.source}</p>
              <h1 class="mt-1 text-20-medium text-text-base">{panels.find((panel) => panel.id === active())?.label}</h1>
              <p class="mt-1 max-w-2xl text-12-regular text-text-weak">The view reflects the assets currently resolved for this project and server.</p>
            </div>
            <Button size="small" variant="ghost" onClick={() => void snapshotActions.refetch()} disabled={snapshot.loading}>Refresh</Button>
          </header>

          <Show when={snapshot.loading && !snapshot()}>
            <ModuleState state="running" title="Loading resolved assets…" />
          </Show>
          <Show when={snapshot.error}>
            <ModuleState
              state="error"
              title="Assets could not be loaded"
              details={formatServerError(snapshot.error)}
              action={{ label: "Retry", onClick: () => void snapshotActions.refetch() }}
            />
          </Show>
          <Show when={snapshot()}>
            {(data) => (
              <Switch>
                <Match when={active() === "skill"}>
                  <div class="mb-3 flex justify-end"><Button size="small" variant="secondary" onClick={() => openEditor("skill", "create")}>+ New skill</Button></div>
                  <SourceErrors keys={failedSources("skill")} sources={data().sources} onRetry={() => void snapshotActions.refetch()} busy={snapshot.loading} />
                  <Show when={failedSources("skill").length === 0}>
                    <AssetList entries={data().skills.map((item) => ({ title: item.name, detail: item.description ?? "No description", meta: item.location }))} empty="No skills are active for this project." />
                  </Show>
                </Match>
                <Match when={active() === "agent"}>
                  <div class="mb-3 flex justify-end"><Button size="small" variant="secondary" onClick={() => openEditor("agent", "create")}>+ New agent</Button></div>
                  <SourceErrors keys={failedSources("agent")} sources={data().sources} onRetry={() => void snapshotActions.refetch()} busy={snapshot.loading} />
                  <Show when={failedSources("agent").length === 0}>
                    <AssetList entries={data().agents.filter((item) => item.mode !== "primary").map((item) => ({ title: item.id, detail: item.description ?? "No description", meta: item.mode }))} empty="No SubAgents are active for this project." />
                  </Show>
                </Match>
                <Match when={active() === "command"}>
                  <div class="mb-3 flex justify-end"><Button size="small" variant="secondary" onClick={() => openEditor("command", "create")}>+ New command</Button></div>
                  <SourceErrors keys={failedSources("command")} sources={data().sources} onRetry={() => void snapshotActions.refetch()} busy={snapshot.loading} />
                  <Show when={failedSources("command").length === 0}>
                    <AssetList entries={data().commands.map((item) => ({ title: `/${item.name}`, detail: item.description ?? "Custom command", meta: item.subtask ? "subtask" : "command" }))} empty="No custom commands are active for this project." />
                  </Show>
                </Match>
                <Match when={active() === "mcp"}>
                  <SourceErrors keys={failedSources("mcp")} sources={data().sources} onRetry={() => void snapshotActions.refetch()} busy={snapshot.loading} />
                  <Show when={failedSources("mcp").length === 0}>
                    <McpPanel mcp={data().mcp} assetApi={assetClient()["server.researchos-assets"]} onRefresh={() => void snapshotActions.refetch()} />
                  </Show>
                </Match>
                <Match when={active() === "model"}>
                  <SourceErrors keys={failedSources("model")} sources={data().sources} onRetry={() => void snapshotActions.refetch()} busy={snapshot.loading} />
                  <Show when={!failedSources("model").includes("models")}>
                    <AssetList entries={data().models.map((item) => ({ title: item.name, detail: `${data().providers.find((provider) => provider.id === item.providerID)?.name ?? item.providerID} · ${item.limit.context.toLocaleString()} context`, meta: item.enabled ? item.status : "disabled" }))} empty="No models are available from connected providers." />
                  </Show>
                </Match>
                <Match when={active() === "plugin"}>
                  <SourceErrors keys={failedSources("plugin")} sources={data().sources} onRetry={() => void snapshotActions.refetch()} busy={snapshot.loading} />
                  <Show when={failedSources("plugin").length === 0}>
                    <AssetList entries={data().plugins.map((item) => ({ title: typeof item === "string" ? item : item[0], detail: "Loaded through the native plugin configuration", meta: "plugin" }))} empty="No plugins are configured." />
                  </Show>
                </Match>
                <Match when={active() === "rules"}>
                  <div class="mb-3 flex justify-end"><Button size="small" variant="secondary" onClick={() => openEditor("rules", "edit", "", data().rules.content)}>Edit rules</Button></div>
                  <SourceErrors keys={failedSources("rules")} sources={data().sources} onRetry={() => void snapshotActions.refetch()} busy={snapshot.loading} />
                  <Show when={failedSources("rules").length === 0}>
                    <RulesPanel rules={data().rules} />
                  </Show>
                </Match>
                <Match when={active() === "api"}>
                  <SourceErrors keys={failedSources("api")} sources={data().sources} onRetry={() => void snapshotActions.refetch()} busy={snapshot.loading} />
                  <Show when={!failedSources("api").includes("api")}>
                    <ApiPanel descriptors={data().api} stats={data().apiStats} onTest={testApi} />
                  </Show>
                </Match>
              </Switch>
            )}
          </Show>
        </div>
      </main>
      <Show when={editor().open}><AssetEditor state={editor()} onClose={closeEditor} onSaved={() => void snapshotActions.refetch()} /></Show>
    </div>
  )
}

function AssetList(props: { readonly entries: Array<{ readonly title: string; readonly detail: string; readonly meta: string; readonly danger?: boolean }>; readonly empty: string }) {
  return (
    <Show when={props.entries.length > 0} fallback={<EmptyState title={props.empty} detail="Add or enable the asset through its native configuration, then refresh this view." />}>
      <div class="overflow-hidden rounded-lg border border-border-weaker-base bg-surface-base">
        <For each={props.entries}>
          {(entry) => (
            <article class="flex items-start gap-4 border-b border-border-weaker-base px-4 py-3.5 last:border-b-0">
              <div class="min-w-0 flex-1">
                <h2 class="truncate text-13-medium text-text-base">{entry.title}</h2>
                <p class="mt-1 text-11-regular text-text-weak">{entry.detail}</p>
              </div>
              <Tag class={entry.danger ? "text-text-on-critical-strong" : undefined}>{entry.meta}</Tag>
            </article>
          )}
        </For>
      </div>
    </Show>
  )
}

function RulesPanel(props: { readonly rules: { readonly path: string; readonly content: string; readonly chain: ReadonlyArray<{ readonly path: string; readonly exists: boolean }> } }) {
  return (
    <div class="flex flex-col gap-4">
      <div class="overflow-hidden rounded-lg border border-border-weaker-base bg-surface-base">
        <For each={props.rules.chain}>
          {(entry) => (
            <div class="flex items-center gap-3 border-b border-border-weaker-base px-4 py-3 last:border-b-0">
              <span class="size-1.5 rounded-full" classList={{ "bg-surface-success-strong": entry.exists, "bg-border-base": !entry.exists }} />
              <code class="min-w-0 flex-1 truncate text-11-regular text-text-weak">{entry.path}</code>
              <Tag>{entry.exists ? "loaded" : "missing"}</Tag>
            </div>
          )}
        </For>
      </div>
      <div class="rounded-lg border border-border-weaker-base bg-surface-base p-4">
        <p class="mb-3 font-mono text-10-medium uppercase tracking-wider text-text-weak">{props.rules.path}</p>
        <pre class="max-h-96 overflow-auto whitespace-pre-wrap text-12-regular leading-5 text-text-weak">{props.rules.content || "No project rules file exists yet."}</pre>
      </div>
    </div>
  )
}

function EmptyState(props: { readonly title: string; readonly detail: string }) {
  return (
    <div class="rounded-lg border border-dashed border-border-base px-5 py-10">
      <h2 class="text-13-medium text-text-base">{props.title}</h2>
      <p class="mt-1 max-w-xl text-12-regular text-text-weak">{props.detail}</p>
    </div>
  )
}

function SourceErrors(props: { readonly keys: ReadonlyArray<SourceKey>; readonly sources: Record<SourceKey, SourceState>; readonly onRetry: () => void; readonly busy: boolean }) {
  return (
    <For each={props.keys}>
      {(key) => (
        <div class="mb-3 flex items-center gap-3 rounded-md border border-border-weaker-base bg-surface-critical-weak px-4 py-3">
          <StatusBadge status="fail" label={sourceNames[key]} detail={props.sources[key].error} />
          <p class="min-w-0 flex-1 truncate text-11-regular text-text-on-critical-strong">{props.sources[key].error ?? "Unknown error"}</p>
          <Button size="small" variant="ghost" disabled={props.busy} onClick={props.onRetry}>Retry</Button>
        </div>
      )}
    </For>
  )
}

const mcpBadgeStatus = (status: string): "ok" | "degraded" | "fail" | "off" => {
  if (status === "connected") return "ok"
  if (status === "failed") return "fail"
  if (status === "disabled") return "off"
  return "degraded"
}

// Server names from packages/researchos-preset/opencode.researchos.json
const PRESET_MCP_SERVERS = [
  "researchos-literature",
  "researchos-data",
  "researchos-plot",
  "researchos-graph",
  "researchos-latex",
  "researchos-reproduce",
  "researchos-translate",
] as const

function ResearchToolsPreset(props: { mcp: Record<string, { status: string; error?: string }>; assetApi: ReturnType<typeof createAssetClient>["server.researchos-assets"]; onRefresh: () => void }) {
  const sdk = useSDK()
  const client = () => sdk().client
  const [installing, setInstalling] = createSignal(false)
  const [installError, setInstallError] = createSignal<string>()
  const [installedServers, setInstalledServers] = createSignal<string[]>()
  const [installedAssets, setInstalledAssets] = createSignal<number>()
  const [statuses, setStatuses] = createSignal<Record<string, { status: string; error?: string }>>()
  const [connectingAll, setConnectingAll] = createSignal(false)
  const enabled = createMemo(() => PRESET_MCP_SERVERS.some((name) => name in props.mcp))
  const presetStatuses = createMemo(() => {
    const current = statuses() ?? props.mcp
    return PRESET_MCP_SERVERS.map((name) => ({ name, entry: current[name] }))
  })
  const refreshStatuses = async () => {
    const status = await client().mcp.status()
    setStatuses(status.data ?? {})
    props.onRefresh()
  }
  const install = async () => {
    setInstalling(true); setInstallError(undefined); setInstalledServers(undefined); setInstalledAssets(undefined)
    try {
      const location = { directory: sdk().directory }
      const mcp = await props.assetApi.presetInstall({ location, pack: "researchos-mcp", target: "project" })
      // agents/commands/skills 落盘到 .opencode/，会话内立即可用，不止 MCP 配置
      const agents = await props.assetApi.presetInstall({ location, pack: "researchos-agents", target: "project" })
      const skills = await props.assetApi.presetInstall({ location, pack: "researchos-skills", target: "project" })
      setInstalledServers(mcp.data.configPatched.map((key) => key.replace(/^mcp\./, "")))
      setInstalledAssets(agents.data.installed.length + skills.data.installed.length)
      await refreshStatuses()
    } catch (err) {
      setInstallError(formatServerError(err))
    } finally { setInstalling(false) }
  }
  const connectAll = async () => {
    setConnectingAll(true)
    try {
      const current = statuses() ?? props.mcp
      for (const name of PRESET_MCP_SERVERS) {
        if (!(name in current)) continue
        // Individual failures surface through the refreshed per-server statuses below
        await client().mcp.connect({ name }).catch(() => {})
      }
      await refreshStatuses()
    } finally { setConnectingAll(false) }
  }
  return (
    <div class="rounded-lg border border-border-weak-base bg-surface-base p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-13-medium text-text-base">Research tools in chat</h2>
            <Show when={enabled()}>
              <StatusBadge status="ok" label="Research tools enabled" />
            </Show>
          </div>
          <p class="mt-1 max-w-xl text-11-regular text-text-weak">
            Installs the ResearchOS preset into this project: MCP servers in opencode config, plus literature/graph/writing agents, commands, and skills under .opencode/.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Show when={!enabled()}>
            <Button size="small" variant="primary" disabled={installing()} onClick={() => void install()}>
              <Show when={installing()} fallback="Enable research tools in chat">
                <Spinner class="size-3.5" />
              </Show>
            </Button>
          </Show>
          <Show when={enabled() || installedServers()}>
            <Button size="small" variant="ghost" disabled={connectingAll() || installing()} onClick={() => void connectAll()}>
              <Show when={connectingAll()} fallback="Connect all">
                <Spinner class="size-3.5" />
              </Show>
            </Button>
          </Show>
        </div>
      </div>
      <Show when={installedServers()}>
        {(servers) => (
          <div class="mt-3 flex items-center gap-2 rounded-md border border-border-weaker-base bg-surface-success-weak px-4 py-2.5">
            <StatusBadge status="ok" label="Saved to project config" />
            <p class="text-11-regular text-text-weak">
              {servers().length} preset servers were written to the project config ({servers().join(", ")}), and {installedAssets() ?? 0} agent/command/skill files were installed into .opencode/. Saving does not connect servers — use Connect all to verify they start.
            </p>
          </div>
        )}
      </Show>
      <Show when={installError()}>
        {(error) => (
          <div class="mt-3 flex items-center gap-3 rounded-md border border-border-weaker-base bg-surface-critical-weak px-4 py-3">
            <StatusBadge status="fail" label="Preset install failed" detail={error()} />
            <p class="min-w-0 flex-1 truncate text-11-regular text-text-on-critical-strong">{error()}</p>
            <Button size="small" variant="ghost" disabled={installing()} onClick={() => void install()}>Retry</Button>
          </div>
        )}
      </Show>
      <Show when={enabled() || installedServers()}>
        <div class="mt-3 flex flex-wrap items-center gap-1.5">
          <For each={presetStatuses()}>
            {(item) => (
              <StatusBadge
                status={item.entry ? mcpBadgeStatus(item.entry.status) : "unknown"}
                label={item.entry ? `${item.name}: ${item.entry.status}` : `${item.name}: not reported`}
                detail={item.entry?.error}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

function McpPanel(props: { mcp: Record<string, { status: string; error?: string }>; assetApi: ReturnType<typeof createAssetClient>["server.researchos-assets"]; onRefresh: () => void }) {
  const sdk = useSDK()
  const [showForm, setShowForm] = createSignal(false)
  const [name, setName] = createSignal("")
  const [serverType, setServerType] = createSignal<"local" | "remote">("local")
  const [command, setCommand] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [saveError, setSaveError] = createSignal<string>()
  const [savedServer, setSavedServer] = createSignal<string>()
  const [connecting, setConnecting] = createSignal<string>()
  const [connectResults, setConnectResults] = createSignal<Record<string, { ok: boolean; detail?: string }>>({})
  const client = () => sdk().client
  const save = async () => {
    if (!name().trim()) return setSaveError("Name is required")
    setSaving(true); setSaveError(undefined); setSavedServer(undefined)
    try {
      const config = serverType() === "local"
        ? { type: "local" as const, command: command().split(/\s+/).filter(Boolean), enabled: true }
        : { type: "remote" as const, url: url().trim(), enabled: true }
      await client().mcp.add({ name: name().trim(), config })
      setSavedServer(name().trim())
      setName(""); setCommand(""); setUrl(""); setShowForm(false); props.onRefresh()
    } catch (err) {
      setSaveError(formatServerError(err))
    } finally { setSaving(false) }
  }
  const connect = async (serverName: string) => {
    setConnecting(serverName)
    try {
      await client().mcp.connect({ name: serverName })
      const status = await client().mcp.status()
      const entry = status.data?.[serverName]
      if (entry?.status === "connected") {
        setConnectResults((current) => ({ ...current, [serverName]: { ok: true } }))
        props.onRefresh()
        return
      }
      const detail = entry && "error" in entry ? entry.error : `Connection state: ${entry?.status ?? "unknown"}`
      setConnectResults((current) => ({ ...current, [serverName]: { ok: false, detail } }))
      props.onRefresh()
    } catch (err) {
      setConnectResults((current) => ({ ...current, [serverName]: { ok: false, detail: formatServerError(err) } }))
    } finally { setConnecting(undefined) }
  }
  return (
    <div class="space-y-3">
      <ResearchToolsPreset mcp={props.mcp} assetApi={props.assetApi} onRefresh={props.onRefresh} />
      <Show when={savedServer()}>
        {(serverName) => (
          <div class="flex items-center gap-2 rounded-md border border-border-weaker-base bg-surface-success-weak px-4 py-2.5">
            <StatusBadge status="ok" label="Saved to project config" />
            <p class="text-11-regular text-text-weak">
              "{serverName()}" was written to the project config. Use Connect to verify it starts — saving does not connect it.
            </p>
          </div>
        )}
      </Show>
      <Show when={showForm()}><div class="rounded-lg border border-border-weak-base bg-surface-base p-3 space-y-2"><input class="h-8 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Server name" /><div class="flex gap-2"><button class="rounded px-2 py-1 text-11-medium" classList={{ "bg-background-selected": serverType() === "local" }} onClick={() => setServerType("local")}>Local</button><button class="rounded px-2 py-1 text-11-medium" classList={{ "bg-background-selected": serverType() === "remote" }} onClick={() => setServerType("remote")}>Remote</button></div><Show when={serverType() === "local"}><input class="h-8 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={command()} onInput={(e) => setCommand(e.currentTarget.value)} placeholder="bun run path/to/server.ts" /></Show><Show when={serverType() === "remote"}><input class="h-8 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="https://mcp.example.com/sse" /></Show><Show when={saveError()}><p class="text-11-regular text-text-on-critical-strong">{saveError()}</p></Show><div class="flex gap-2"><Button size="small" variant="primary" disabled={saving()} onClick={() => void save()}>{saving() ? "Saving…" : "Save"}</Button><Button size="small" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button></div></div></Show>
      <div class="flex justify-end"><Button size="small" variant="secondary" onClick={() => setShowForm(!showForm())}>{showForm() ? "Cancel" : "+ Add MCP server"}</Button></div>
      <Show
        when={Object.keys(props.mcp).length > 0}
        fallback={<EmptyState title="No MCP servers are configured." detail="Add a server, save it to the project config, then connect it to verify it starts." />}
      >
        <div class="overflow-hidden rounded-lg border border-border-weaker-base bg-surface-base">
          <For each={Object.entries(props.mcp)}>
            {([serverName, item]) => (
              <article class="border-b border-border-weaker-base px-4 py-3.5 last:border-b-0">
                <div class="flex items-start gap-4">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="truncate text-13-medium text-text-base">{serverName}</h2>
                      <StatusBadge status={mcpBadgeStatus(item.status)} label={item.status} detail={item.error} />
                    </div>
                    <Show when={item.status === "failed" && item.error}>
                      <p class="mt-1 text-11-regular text-text-on-critical-strong">{item.error}</p>
                    </Show>
                  </div>
                  <Button size="small" variant="ghost" disabled={connecting() !== undefined} onClick={() => void connect(serverName)}>
                    <Show when={connecting() === serverName} fallback="Connect">
                      <Spinner class="size-3.5" />
                    </Show>
                  </Button>
                </div>
                <Show when={connectResults()[serverName]}>
                  {(result) => (
                    <div class="mt-2 flex items-center gap-2">
                      <StatusBadge status={result().ok ? "ok" : "fail"} label={result().ok ? "Connected" : "Connection failed"} detail={result().detail} />
                      <Show when={!result().ok}>
                        <p class="min-w-0 flex-1 truncate text-11-regular text-text-on-critical-strong">{result().detail}</p>
                        <button type="button" class="shrink-0 text-11-medium text-text-interactive-base hover:underline" onClick={() => void connect(serverName)}>Retry</button>
                      </Show>
                    </div>
                  )}
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

type EditorKind = "skill" | "agent" | "command" | "rules"
type EditorState = { open: boolean; kind: EditorKind; name: string; content: string; scope: "project" | "global"; mode: "create" | "edit" }

function AssetEditor(props: { state: EditorState; onClose: () => void; onSaved: () => void }) {
  const sdk = useSDK()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const assetClient = createMemo(() => createAssetClient({ baseUrl: sdk().url, fetch: platform.fetch, username: serverSDK().server.http.username, password: serverSDK().server.http.password })["server.researchos-assets"])
  const [name, setName] = createSignal(props.state.name)
  const [content, setContent] = createSignal(props.state.content)
  const [scope, setScope] = createSignal(props.state.scope)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const kindLabel = () => ({ skill: "Skill", agent: "SubAgent", command: "Command", rules: "Rules" }[props.state.kind])
  const save = async () => {
    if (props.state.kind !== "rules" && !name().trim()) return setError("Name is required")
    setSaving(true); setError(undefined)
    try {
      if (props.state.kind === "rules") {
        await assetClient().fileWrite({ location: { directory: sdk().directory }, kind: "rules", name: "_rules", content: content(), scope: scope() })
      } else {
        await assetClient().fileWrite({ location: { directory: sdk().directory }, kind: props.state.kind, name: name().trim(), content: content(), scope: scope() })
      }
      props.onSaved(); props.onClose()
    } catch (err) {
      setError(formatServerError(err))
    } finally { setSaving(false) }
  }
  return <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}><div class="w-full max-w-2xl rounded-xl border border-border-base bg-background-base p-6 shadow-xl" onClick={(e) => e.stopPropagation()}><div class="mb-4 flex items-center justify-between"><h2 class="text-16-medium">{props.state.mode === "create" ? "New" : "Edit"} {kindLabel()}</h2><Button size="small" variant="ghost" onClick={props.onClose}>Close</Button></div><Show when={props.state.kind !== "rules"}><label class="mb-3 block text-11-regular text-text-weak">Name<input class="mt-1 h-8 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder={props.state.kind === "skill" ? "my-skill" : props.state.kind === "agent" ? "my-agent" : "my-command"} /></label></Show><label class="mb-1 block text-11-regular text-text-weak">{props.state.kind === "rules" ? "AGENTS.md content" : "File content (with frontmatter)"}</label><textarea aria-label={props.state.kind === "rules" ? "AGENTS.md content" : "File content (with frontmatter)"} class="mb-3 h-72 w-full rounded border border-border-weak-base bg-background-stronger p-3 font-mono text-11-regular" value={content()} onInput={(e) => setContent(e.currentTarget.value)} placeholder={props.state.kind === "skill" ? "---\ndescription: What this skill does\n---\n\n# Skill instructions..." : props.state.kind === "rules" ? "# Project Rules\n\nInstructions for the AI agent..." : "---\ndescription: What this agent does\nmode: subagent\n---\n\nYou are a..."} /><Show when={error()}><p class="mb-2 text-11-regular text-text-on-critical-strong">{error()}</p></Show><div class="flex items-center justify-between"><select aria-label="Asset scope" class="h-7 rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={scope()} onChange={(e) => setScope(e.currentTarget.value as "project" | "global")}><option value="project">Project</option><option value="global">Global</option></select><Button size="small" variant="primary" disabled={saving()} onClick={() => void save()}>{saving() ? "Saving…" : "Save"}</Button></div></div></div>
}
