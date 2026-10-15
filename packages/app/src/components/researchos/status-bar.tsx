import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { createSignal, For, Show } from "solid-js"
import type { ResearchosHealth } from "./health"
import { StatusBadge } from "./module-state"

const statusRank = { fail: 0, degraded: 1, unknown: 2, off: 3, ok: 4 } as const

const dotClass = {
  fail: "bg-icon-critical-base",
  degraded: "bg-icon-warning-base",
  unknown: "bg-border-weak-base",
  off: "bg-border-base",
  ok: "bg-icon-success-base",
} as const

export function StatusBar(props: { health: ResearchosHealth }) {
  const [open, setOpen] = createSignal(false)

  const worst = () => props.health.services().reduce<(keyof typeof statusRank)>((acc, service) => (statusRank[service.status] < statusRank[acc] ? service.status : acc), "ok")

  return (
    <div class="relative shrink-0 border-t border-border-weak-base bg-background-base">
      <Show when={open()}>
        <div class="absolute bottom-full right-0 z-20 mb-1 mr-2 w-80 rounded-lg border border-border-weak-base bg-background-stronger shadow-[var(--shadow-lg-border-base)]">
          <div class="flex items-center justify-between border-b border-border-weak-base px-3 py-2">
            <p class="text-11-medium text-text-base">Service health</p>
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="small" onClick={() => props.health.refetch()}>
                Recheck
              </Button>
              <button
                class="flex size-6 items-center justify-center rounded-md text-text-weak hover:bg-background-selected hover:text-text-base"
                onClick={() => setOpen(false)}
                aria-label="Close service health"
              >
                <Icon name="close-small" size="small" />
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-1 px-2 py-2">
            <For each={props.health.services()}>
              {(service) => (
                <div class="flex items-center gap-2 rounded-md px-1.5 py-1.5">
                  <StatusBadge status={service.status} label={service.name} />
                  <span class="min-w-0 flex-1 truncate font-mono text-10-regular text-text-weak" title={service.detail}>
                    {service.detail ?? service.status}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <button
        class="flex h-[26px] w-full select-none items-center gap-3 px-3 font-mono text-10-regular text-text-weak transition-colors hover:bg-background-selected"
        onClick={() => setOpen((value) => !value)}
        aria-label="Toggle service health details"
      >
        <span class={`size-1.5 shrink-0 animate-pulse rounded-full ${dotClass[worst()]}`} />
        <For each={props.health.services()}>{(service) => <StatusBadge status={service.status} label={service.name} />}</For>
        <span class="flex-1" />
        <span class="text-text-weaker">ResearchOS</span>
      </button>
    </div>
  )
}
