import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tag } from "@opencode-ai/ui/tag"
import { useSearchParams } from "@solidjs/router"
import { createMemo, createResource, createSignal, For, Match, Show, Switch } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createAssetClient } from "./api"
import { ApiPanel } from "./api-panel"

type PanelId = "skill" | "mcp" | "model" | "agent" | "command" | "rules" | "plugin" | "api"

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
      const [skills, agents, commands, models, providers, mcp, config, rules, api, apiStats] = await Promise.all([
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
        skills: skills.data?.data ?? [],
        agents: agents.data?.data ?? [],
        commands: commands.data?.data ?? [],
        models: models.data?.data ?? [],
        providers: providers.data?.data ?? [],
        mcp: mcp.data ?? {},
        plugins: config.data?.plugin ?? [],
        rules: rules.data,
        api: api.data,
        apiStats: apiStats.data,
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
                <span
                  class="size-1.5 shrink-0 rounded-full bg-border-base"
                  classList={{
                    "bg-surface-success-strong": panel.id !== "api" && counts()[panel.id] > 0 && !(panel.id === "mcp" && failedMcp()),
                    "bg-surface-critical-strong": panel.id === "mcp" && failedMcp(),
                  }}
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

          <Show when={snapshot.loading}>
            <div class="flex items-center gap-2 rounded-md border border-border-weaker-base px-4 py-8 text-12-regular text-text-weak">
              <Spinner class="size-4" /> Loading resolved assets…
            </div>
          </Show>
          <Show when={snapshot.error}>
            <EmptyState title="Assets could not be loaded" detail={snapshot.error instanceof Error ? snapshot.error.message : String(snapshot.error)} />
          </Show>
          <Show when={snapshot()}>
            {(data) => (
              <Switch>
                <Match when={active() === "skill"}>
                  <div class="mb-3 flex justify-end"><Button size="small" variant="secondary" onClick={() => openEditor("skill", "create")}>+ New skill</Button></div>
                  <AssetList entries={data().skills.map((item) => ({ title: item.name, detail: item.description ?? "No description", meta: item.location }))} empty="No skills are active for this project." />
                </Match>
                <Match when={active() === "agent"}>
                  <div class="mb-3 flex justify-end"><Button size="small" variant="secondary" onClick={() => openEditor("agent", "create")}>+ New agent</Button></div>
                  <AssetList entries={data().agents.filter((item) => item.mode !== "primary").map((item) => ({ title: item.id, detail: item.description ?? "No description", meta: item.mode }))} empty="No SubAgents are active for this project." />
                </Match>
                <Match when={active() === "command"}>
                  <div class="mb-3 flex justify-end"><Button size="small" variant="secondary" onClick={() => openEditor("command", "create")}>+ New command</Button></div>
                  <AssetList entries={data().commands.map((item) => ({ title: `/${item.name}`, detail: item.description ?? "Custom command", meta: item.subtask ? "subtask" : "command" }))} empty="No custom commands are active for this project." />
                </Match>
                <Match when={active() === "mcp"}>
                  <McpPanel mcp={data().mcp} onRefresh={() => void snapshotActions.refetch()} />
                </Match>
                <Match when={active() === "model"}>
                  <AssetList entries={data().models.map((item) => ({ title: item.name, detail: `${data().providers.find((provider) => provider.id === item.providerID)?.name ?? item.providerID} · ${item.limit.context.toLocaleString()} context`, meta: item.enabled ? item.status : "disabled" }))} empty="No models are available from connected providers." />
                </Match>
                <Match when={active() === "plugin"}>
                  <AssetList entries={data().plugins.map((item) => ({ title: typeof item === "string" ? item : item[0], detail: "Loaded through the native plugin configuration", meta: "plugin" }))} empty="No plugins are configured." />
                </Match>
                <Match when={active() === "rules"}>
                  <div class="mb-3 flex justify-end"><Button size="small" variant="secondary" onClick={() => openEditor("rules", "edit", "", data().rules.content)}>Edit rules</Button></div>
                  <RulesPanel rules={data().rules} />
                </Match>
                <Match when={active() === "api"}>
                  <ApiPanel descriptors={data().api} stats={data().apiStats} onTest={testApi} />
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

function McpPanel(props: { mcp: Record<string, { status: string; error?: string }>; onRefresh: () => void }) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const [showForm, setShowForm] = createSignal(false)
  const [name, setName] = createSignal("")
  const [serverType, setServerType] = createSignal<"local" | "remote">("local")
  const [command, setCommand] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const client = () => sdk().client
  const save = async () => {
    if (!name().trim()) return setError("Name is required")
    setBusy(true); setError(undefined)
    try {
      const patch: Record<string, unknown> = serverType() === "local"
        ? { type: "local", command: command().split(/\s+/).filter(Boolean), enabled: true }
        : { type: "remote", url: url().trim(), enabled: true }
      const result = await client().config.get()
      const current = result.data as Record<string, unknown>
      const mcp = { ...((current.mcp as Record<string, unknown>) ?? {}) }
      mcp[name().trim()] = patch
      await (client().config as any).patch({ mcp })
      await (client().mcp as any).add({ name: name().trim(), ...patch })
      setName(""); setCommand(""); setUrl(""); setShowForm(false); props.onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setBusy(false) }
  }
  return (
    <div class="space-y-3">
      <Show when={showForm()}><div class="rounded-lg border border-border-weak-base bg-surface-base p-3 space-y-2"><input class="h-8 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Server name" /><div class="flex gap-2"><button class="rounded px-2 py-1 text-11-medium" classList={{ "bg-background-selected": serverType() === "local" }} onClick={() => setServerType("local")}>Local</button><button class="rounded px-2 py-1 text-11-medium" classList={{ "bg-background-selected": serverType() === "remote" }} onClick={() => setServerType("remote")}>Remote</button></div><Show when={serverType() === "local"}><input class="h-8 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={command()} onInput={(e) => setCommand(e.currentTarget.value)} placeholder="bun run path/to/server.ts" /></Show><Show when={serverType() === "remote"}><input class="h-8 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="https://mcp.example.com/sse" /></Show><Show when={error()}><p class="text-11-regular text-text-on-critical-strong">{error()}</p></Show><div class="flex gap-2"><Button size="small" variant="primary" disabled={busy()} onClick={() => void save()}>{busy() ? "Saving…" : "Save"}</Button><Button size="small" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button></div></div></Show>
      <div class="flex justify-end"><Button size="small" variant="secondary" onClick={() => setShowForm(!showForm())}>{showForm() ? "Cancel" : "+ Add MCP server"}</Button></div>
      <AssetList entries={Object.entries(props.mcp).map(([n, item]) => ({ title: n, detail: (item.status === "failed" ? item.error : `Connection state: ${item.status}`) ?? "", meta: item.status, danger: item.status === "failed" }))} empty="No MCP servers are configured." />
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
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const kindLabel = () => ({ skill: "Skill", agent: "SubAgent", command: "Command", rules: "Rules" }[props.state.kind])
  const save = async () => {
    if (props.state.kind !== "rules" && !name().trim()) return setError("Name is required")
    setSaving(true); setError(undefined)
    try {
      if (props.state.kind === "rules") {
        await (assetClient() as any).fileWrite({ location: { directory: sdk().directory }, kind: "rules", name: "_rules", content: content(), scope: props.state.scope })
      } else {
        await (assetClient() as any).fileWrite({ location: { directory: sdk().directory }, kind: props.state.kind, name: name().trim(), content: content(), scope: props.state.scope })
      }
      props.onSaved(); props.onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSaving(false) }
  }
  return <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}><div class="w-full max-w-2xl rounded-xl border border-border-base bg-background-base p-6 shadow-xl" onClick={(e) => e.stopPropagation()}><div class="mb-4 flex items-center justify-between"><h2 class="text-16-medium">{props.state.mode === "create" ? "New" : "Edit"} {kindLabel()}</h2><Button size="small" variant="ghost" onClick={props.onClose}>Close</Button></div><Show when={props.state.kind !== "rules"}><label class="mb-3 block text-11-regular text-text-weak">Name<input class="mt-1 h-8 w-full rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder={props.state.kind === "skill" ? "my-skill" : props.state.kind === "agent" ? "my-agent" : "my-command"} /></label></Show><label class="mb-1 block text-11-regular text-text-weak">{props.state.kind === "rules" ? "AGENTS.md content" : "File content (with frontmatter)"}</label><textarea class="mb-3 h-72 w-full rounded border border-border-weak-base bg-background-stronger p-3 font-mono text-11-regular" value={content()} onInput={(e) => setContent(e.currentTarget.value)} placeholder={props.state.kind === "skill" ? "---\ndescription: What this skill does\n---\n\n# Skill instructions..." : props.state.kind === "rules" ? "# Project Rules\n\nInstructions for the AI agent..." : "---\ndescription: What this agent does\nmode: subagent\n---\n\nYou are a..."} /><Show when={error()}><p class="mb-2 text-11-regular text-text-on-critical-strong">{error()}</p></Show><div class="flex items-center justify-between"><select class="h-7 rounded border border-border-weak-base bg-background-stronger px-2 text-11-regular" value={props.state.scope} onChange={(e) => { props.state.scope = e.currentTarget.value as "project" | "global" }}><option value="project">Project</option><option value="global">Global</option></select><Button size="small" variant="primary" disabled={saving()} onClick={() => void save()}>{saving() ? "Saving…" : "Save"}</Button></div></div></div>
}
