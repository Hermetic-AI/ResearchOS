import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Spinner } from "@opencode/ui/spinner"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { useLocation, useNavigate } from "@solidjs/router"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { researchosModules, useResearchosDirectory, useResearchosLink } from "@/components/researchos-rail"
import { createResearchosClient } from "@/utils/researchos-client"
import { buildPaperSystem, fetchPaperContext, fetchPaperSections, formatRetrievedSections, LIBRARY_ONLY_INSTRUCTION, recordPaperSession } from "./paper-context"
import { useResearchosShell } from "./shell-context"

type DockTurn = {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly text: string
}

const POLL_INTERVAL = 3000
const MESSAGE_LIMIT = 100

// One companion session per directory/module/resource context, persisted in localStorage.
const storageKey = (context: string) => `researchos.dockSession.${context}`

const readStored = (key: string) => {
  if (typeof localStorage === "undefined") return undefined
  return localStorage.getItem(key) ?? undefined
}

const writeStored = (key: string, value: string) => {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(key, value)
}

const removeStored = (key: string) => {
  if (typeof localStorage === "undefined") return
  localStorage.removeItem(key)
}

// User prompts carry an injected `[ResearchOS module: …]` scope prefix; hide it in the transcript.
const displayText = (role: string, text: string) => {
  if (role !== "user") return text
  if (!text.startsWith("[ResearchOS module:")) return text
  const cut = text.indexOf("\n\n")
  if (cut === -1) return text
  return text.slice(cut + 2)
}

export function AgentDock() {
  const researchosDirectory = useResearchosDirectory()
  const directory = () => researchosDirectory() ?? ""
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const location = useLocation()
  const navigate = useNavigate()
  const link = useResearchosLink()
  const shell = useResearchosShell()
  const [draft, setDraft] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [libraryOnly, setLibraryOnly] = createSignal(false)
  const [sessionID, setSessionID] = createSignal<string>()
  const [items, setItems] = createSignal<SessionMessageInfo[]>([])
  let textarea!: HTMLTextAreaElement
  let transcript!: HTMLDivElement

  const module = createMemo(() => {
    const routed = researchosModules.find((item) => location.pathname.endsWith(`/${item.route}`))
    return shell.agent()?.module ?? routed?.label ?? "Overview"
  })
  const contextKey = createMemo(() => `${directory()}:${module()}:${shell.agent()?.resource ?? "general"}`)
  const basename = createMemo(() => directory().split(/[\\/]/).filter(Boolean).pop() ?? directory())
  const literature = createMemo(() => createResearchosClient({
    baseUrl: serverSDK.url,
    fetch: platform.fetch,
    password: serverSDK.server.http.password,
  })["server.researchos-literature"].literature)

  const turns = createMemo<DockTurn[]>(() =>
    items()
      .slice()
      .sort((a, b) => a.time.created - b.time.created)
      .flatMap((message): DockTurn[] => {
        if (message.type === "user") {
          const text = displayText("user", message.text).trim()
          return text ? [{ id: message.id, role: "user" as const, text }] : []
        }
        if (message.type === "assistant") {
          const text = message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n").trim()
          return text ? [{ id: message.id, role: "assistant" as const, text }] : []
        }
        return []
      }),
  )
  const thinking = createMemo(() => busy() || turns().at(-1)?.role === "user")

  // Switch the companion session when the module/resource context changes.
  createEffect(() => {
    setSessionID(readStored(storageKey(contextKey())))
    setItems([])
  })

  createEffect(() => {
    if (shell.dockOpen()) {
      textarea.focus()
      const pending = shell.pendingPrompt()
      if (pending) {
        setDraft(pending)
        shell.setPendingPrompt("")
      }
    }
  })

  // Poll the persisted session while the dock is open; stop when collapsed.
  createEffect(() => {
    const id = sessionID()
    if (!shell.dockOpen() || !id) return
    void loadMessages(id)
    const timer = setInterval(() => void loadMessages(id), POLL_INTERVAL)
    onCleanup(() => clearInterval(timer))
  })

  // Keep the transcript pinned to the latest message.
  createEffect(() => {
    turns()
    if (!shell.dockOpen() || !transcript) return
    queueMicrotask(() => {
      transcript.scrollTop = transcript.scrollHeight
    })
  })

  const loadMessages = async (id: string) => {
    const response = await serverSDK.api.message.list({ sessionID: id, limit: MESSAGE_LIMIT }).catch(() => undefined)
    if (!response?.data) {
      // The stored session is gone (deleted or server reset); start fresh on next send.
      if (sessionID() !== id) return
      removeStored(storageKey(contextKey()))
      setSessionID(undefined)
      setItems([])
      return
    }
    if (sessionID() !== id) return
    setItems(response.data)
  }

  const ensureSession = async () => {
    const existing = sessionID()
    if (existing) return existing
    const session = await serverSDK.api.session.create({ title: `ResearchOS · ${module()}`, location: { directory: directory() } })
    if (!session) throw new Error("Session creation returned no data")
    writeStored(storageKey(contextKey()), session.id)
    setSessionID(session.id)
    return session.id
  }

  const reset = () => {
    removeStored(storageKey(contextKey()))
    setSessionID(undefined)
    setItems([])
    setError(undefined)
  }

  const openFull = () => {
    const id = sessionID()
    if (!id) return
    navigate(link()!.session(id))
  }

  const submit = () => {
    const text = draft().trim()
    if (!text || busy()) return
    setBusy(true)
    setError(undefined)
    void (async () => {
      const id = await ensureSession()
      const paperId = shell.agent()?.module === "literature" ? shell.agent()?.resource : undefined
      if (paperId) recordPaperSession(directory(), paperId, id)
      const context = paperId
        ? await fetchPaperContext({ literature: literature(), directory: directory(), paperId }).catch(() => undefined)
        : undefined
      if (context) {
        const retrieved = await fetchPaperSections({ literature: literature(), directory: directory(), paperId: context.paper.id, query: text })
        const block = retrieved?.sections.length ? formatRetrievedSections(context.paper.id, retrieved.sections) : undefined
        // 2.0 prompts carry no per-request system field, so the paper dossier opens the body.
        const system = buildPaperSystem({ paper: context.paper, directory: directory(), libraryOnly: libraryOnly() })
        await serverSDK.api.session.prompt({
          sessionID: id,
          text: block ? `${system}\n\n${block}\n\n${text}` : `${system}\n\n${text}`,
        })
        return id
      }
      const prefix = `[ResearchOS module: ${module()}${shell.agent()?.resource ? ` · resource: ${shell.agent()?.resource}` : ""} · project: ${directory()}]`
      const scoped = libraryOnly() ? `${prefix}\n[Scope] ${LIBRARY_ONLY_INSTRUCTION}` : prefix
      await serverSDK.api.session.prompt({ sessionID: id, text: `${scoped}\n\n${text}` })
      return id
    })().then(
      (id) => {
        setDraft("")
        void loadMessages(id)
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    ).finally(() => setBusy(false))
  }

  return (
    <div class="shrink-0 border-t border-border-weak-base bg-background-base">
      <Show when={shell.dockOpen()}>
        <div class="border-b border-border-weak-base px-3 pb-2 pt-2">
          <div class="flex items-center justify-between gap-2 pb-1.5">
            <span class="font-mono text-10-regular text-text-weaker">
              {sessionID() ? "Companion chat" : "New conversation"}
            </span>
            <Show when={sessionID()}>
              <div class="flex items-center gap-2">
                <button
                  class="text-11-regular text-text-weak transition-colors hover:text-text-base"
                  onClick={openFull}
                >
                  Open full chat
                </button>
                <button
                  class="text-11-regular text-text-weak transition-colors hover:text-text-base"
                  onClick={reset}
                >
                  New chat
                </button>
              </div>
            </Show>
          </div>
          <Show when={turns().length > 0}>
            <div
              ref={transcript}
              class="mb-2 max-h-[40vh] overflow-y-auto rounded-md border border-border-weak-base bg-surface-inset-base px-2 py-1"
            >
              <For each={turns()}>
                {(turn) => (
                  <div class="border-b border-border-weak-base py-1.5 last:border-b-0">
                    <div class="font-mono text-10-medium uppercase text-text-weaker">
                      {turn.role === "user" ? "You" : "Assistant"}
                    </div>
                    <p class="whitespace-pre-wrap text-12-regular text-text-base">{turn.text}</p>
                  </div>
                )}
              </For>
              <Show when={thinking()}>
                <div class="py-1.5 font-mono text-10-regular text-text-weaker">Thinking…</div>
              </Show>
              <p class="py-1 text-10-regular text-text-weaker">View full conversation for rich content</p>
            </div>
          </Show>
          <textarea
            ref={textarea}
            class="w-full resize-none rounded-md border border-border-weak-base bg-surface-inset-base px-2 py-1.5 text-12-regular text-text-base outline-none placeholder:text-text-weaker focus:border-border-focus"
            rows={2}
            placeholder={`Ask an agent about ${module()}…`}
            value={draft()}
            onInput={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return
              event.preventDefault()
              submit()
            }}
          />
          <div class="mt-1.5 flex items-center justify-between gap-2">
            <label class="flex cursor-pointer items-center gap-1.5 text-11-regular text-text-weak hover:text-text-base">
              <input
                type="checkbox"
                class="size-3 accent-current"
                checked={libraryOnly()}
                onChange={(event) => setLibraryOnly(event.currentTarget.checked)}
              />
              Library only
            </label>
            <Show when={shell.agent()?.module === "literature" && shell.agent()?.resource}>
              <span class="text-10-regular text-text-weaker">Paper context attached on send</span>
            </Show>
          </div>
          <Show when={error()}>
            {(message) => <p class="mt-1.5 text-11-regular text-text-on-critical-strong">{message()}</p>}
          </Show>
        </div>
      </Show>
      <div class="flex h-8 items-center gap-2 px-3">
        <button
          class="flex min-w-0 flex-1 items-center gap-2 text-left text-11-medium text-text-weak transition-colors hover:text-text-base"
          onClick={() => shell.setDockOpen(!shell.dockOpen())}
          aria-label={shell.dockOpen() ? "Collapse agent dock" : "Expand agent dock"}
        >
          <Icon name="subagent" size="small" class="shrink-0" />
          <span class="truncate">{module()}</span>
          <span class="shrink-0 text-text-weaker">·</span>
          <span class="truncate font-mono text-10-regular text-text-weaker">{basename()}</span>
        </button>
        <Show when={shell.dockOpen()}>
          <Button variant="submit" size="small" disabled={busy() || !draft().trim()} onClick={submit}>
            <Show when={busy()} fallback={<Icon name="arrow-up" size="small" />}>
              <Spinner class="size-3" />
            </Show>
            Send
          </Button>
        </Show>
        <button
          class="flex size-6 shrink-0 items-center justify-center rounded-md text-text-weak hover:bg-background-selected hover:text-text-base"
          onClick={() => shell.setDockOpen(!shell.dockOpen())}
          aria-label={shell.dockOpen() ? "Collapse agent dock" : "Expand agent dock"}
        >
          <Icon name="chevron-grabber-vertical" size="small" />
        </button>
      </div>
    </div>
  )
}
