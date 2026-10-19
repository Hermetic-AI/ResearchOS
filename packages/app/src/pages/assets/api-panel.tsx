import { Button } from "@opencode/ui/button"
import { Spinner } from "@opencode/ui/spinner"
import { Badge } from "@opencode/ui/badge"
import { createSignal, For, Show } from "solid-js"
import { StatusBadge } from "@/components/researchos/module-state"

type ApiDescriptor = {
  readonly name: string
  readonly description: string
  readonly baseUrl: string
  readonly auth: "none" | "api_key" | "bearer" | "mailto"
  readonly rps: number | string
  readonly burst: number | string
  readonly cacheTtlS: number | string
  readonly enabled: boolean
}

type ApiStatus = {
  readonly name: string
  readonly state: "idle" | "healthy" | "failed" | "disabled"
  readonly lastError?: string | null
  readonly callsTotal: number | string
  readonly cacheHitRate: number | string
}

type TestResult = {
  readonly ok: boolean
  readonly latencyMs: number | string
  readonly error?: string | null
}

export function ApiPanel(props: {
  readonly descriptors: ReadonlyArray<ApiDescriptor>
  readonly stats: ReadonlyArray<ApiStatus>
  readonly onTest: (name: string) => Promise<TestResult>
}) {
  const [testing, setTesting] = createSignal<string>()
  const [results, setResults] = createSignal<Record<string, TestResult>>({})
  const test = async (name: string) => {
    setTesting(name)
    const result = await props.onTest(name).catch((error: unknown) => ({
      ok: false,
      latencyMs: 0,
      error: error instanceof Error ? error.message : String(error),
    }))
    setResults((current) => ({ ...current, [name]: result }))
    setTesting(undefined)
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-start justify-between gap-4 rounded-lg border border-border-weaker-base bg-surface-inset-base px-4 py-3">
        <div>
          <h2 class="text-12-medium text-text-base">Academic API control plane</h2>
          <p class="mt-1 text-11-regular text-text-weak">Calls use provider queues, transient retry, narrow schemas, and the project SQLite cache.</p>
        </div>
        <Badge>{props.descriptors.length} adapters</Badge>
      </div>

      <For each={props.descriptors}>
        {(descriptor) => {
          const status = () => props.stats.find((item) => item.name === descriptor.name)
          const result = () => results()[descriptor.name]
          return (
            <article class="rounded-lg border border-border-weaker-base bg-surface-base px-4 py-4">
              <div class="flex items-start gap-4">
                <span class="mt-1 shrink-0" aria-label={status()?.state ?? "idle"}>
                  <StatusBadge
                    status={apiBadgeStatus(status()?.state ?? "idle")}
                    label={status()?.state ?? "idle"}
                    detail={status()?.lastError ?? undefined}
                  />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="text-13-medium text-text-base">{descriptor.name}</h2>
                    <Badge>{descriptor.auth}</Badge>
                    <Badge>{descriptor.rps} req/s</Badge>
                  </div>
                  <p class="mt-1 text-11-regular text-text-weak">{descriptor.description}</p>
                  <p class="mt-2 truncate font-mono text-10-regular text-text-weaker">{descriptor.baseUrl}</p>
                </div>
                <Button
                  size="small"
                  variant="ghost"
                  disabled={testing() !== undefined}
                  onClick={() => void test(descriptor.name)}
                >
                  <Show when={testing() === descriptor.name} fallback="Test connection">
                    <Spinner class="size-3.5" />
                  </Show>
                </Button>
              </div>

              <div class="mt-3 grid grid-cols-3 gap-2 border-t border-border-weaker-base pt-3 text-10-regular text-text-weak">
                <Metric label="Calls" value={String(status()?.callsTotal ?? 0)} />
                <Metric label="Cache hit" value={`${Math.round(Number(status()?.cacheHitRate ?? 0) * 100)}%`} />
                <Metric label="Cache TTL" value={duration(Number(descriptor.cacheTtlS))} />
              </div>

              <Show when={status()?.lastError}>
                {(error) => <p class="mt-3 text-11-regular text-text-on-critical-strong">{error()}</p>}
              </Show>
              <Show when={result()}>
                {(value) => (
                  <p class="mt-3 text-11-regular" classList={{ "text-text-on-success-strong": value().ok, "text-text-on-critical-strong": !value().ok }}>
                    {value().ok ? `Connection succeeded in ${value().latencyMs} ms` : value().error ?? "Connection failed"}
                  </p>
                )}
              </Show>
            </article>
          )
        }}
      </For>
    </div>
  )
}

function apiBadgeStatus(state: ApiStatus["state"]): "ok" | "fail" | "off" | "unknown" {
  if (state === "healthy") return "ok"
  if (state === "failed") return "fail"
  if (state === "disabled") return "off"
  return "unknown"
}

function Metric(props: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p class="text-text-weaker">{props.label}</p>
      <p class="mt-0.5 font-mono text-text-base">{props.value}</p>
    </div>
  )
}

function duration(seconds: number) {
  if (seconds >= 86400) return `${Math.round(seconds / 86400)}d`
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`
  return `${seconds}s`
}
