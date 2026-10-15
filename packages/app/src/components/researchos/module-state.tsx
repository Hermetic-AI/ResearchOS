import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Spinner } from "@opencode/ui/spinner"
import { type ParentProps, Show } from "solid-js"
import type { ResearchosServiceStatus } from "./health"

export type ResearchosModuleState = "ready" | "empty" | "setup_required" | "running" | "degraded" | "error"

type ModuleStateAction = {
  readonly label: string
  readonly onClick: () => void
}

const badgeStyles: Record<ResearchosServiceStatus, { pill: string; dot: string }> = {
  ok: { pill: "bg-surface-success-weak text-text-on-success-strong", dot: "bg-icon-success-base" },
  degraded: { pill: "bg-surface-warning-weak text-text-on-warning-strong", dot: "bg-icon-warning-base" },
  fail: { pill: "bg-surface-critical-weak text-text-on-critical-strong", dot: "bg-icon-critical-base" },
  off: { pill: "bg-surface-raised-base text-text-weak", dot: "bg-border-base" },
  unknown: { pill: "bg-surface-base text-text-weaker", dot: "bg-border-weak-base" },
}

export function StatusBadge(props: { status: ResearchosServiceStatus; label: string; detail?: string }) {
  return (
    <span
      class={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-10-medium ${badgeStyles[props.status].pill}`}
      title={props.detail}
    >
      <span class={`size-1.5 shrink-0 rounded-full ${badgeStyles[props.status].dot}`} />
      <span class="truncate">{props.label}</span>
    </span>
  )
}

const stateHints: Record<Exclude<ResearchosModuleState, "ready">, string> = {
  empty: "Add content or connect a source to get started.",
  setup_required: "Complete the setup steps, then reload this module.",
  running: "This may take a moment; you can keep working elsewhere.",
  degraded: "Some features may be unavailable until the issue is resolved.",
  error: "Check the details above, fix the cause, then retry.",
}

function StateIcon(props: { state: Exclude<ResearchosModuleState, "ready"> }) {
  if (props.state === "running") return <Spinner class="size-5 text-text-weak" />
  if (props.state === "error") return <Icon name="circle-x" size="large" class="text-text-on-critical-strong" />
  if (props.state === "degraded") return <Icon name="warning" size="large" class="text-text-on-warning-strong" />
  if (props.state === "setup_required") return <Icon name="settings-gear" size="large" class="text-text-weak" />
  return <Icon name="bullet-list" size="large" class="text-text-weak" />
}

export function ModuleState(
  props: ParentProps<{
    state: ResearchosModuleState
    title: string
    description?: string
    action?: ModuleStateAction
    secondary?: ModuleStateAction
    details?: string
  }>,
) {
  if (props.state === "ready") return props.children

  return (
    <div class="flex size-full min-h-0 items-center justify-center overflow-y-auto bg-background-stronger p-6">
      <div class="flex w-full max-w-md flex-col items-center rounded-xl border border-border-weak-base bg-background-base px-8 py-10 text-center">
        <StateIcon state={props.state} />
        <p class="mt-4 text-14-medium text-text-base">{props.title}</p>
        <Show when={props.description}>
          {(description) => <p class="mt-1.5 text-11-regular text-text-weak">{description()}</p>}
        </Show>
        <Show when={props.details}>
          {(details) => (
            <pre class="mt-3 w-full overflow-x-auto whitespace-pre-wrap rounded-md border border-border-weaker-base bg-surface-inset-base px-3 py-2 text-left text-12-mono text-text-weak">
              {details()}
            </pre>
          )}
        </Show>
        <Show
          when={props.action || props.secondary}
          fallback={<p class="mt-3 text-10-regular text-text-weaker">{stateHints[props.state]}</p>}
        >
          <div class="mt-4 flex items-center gap-2">
            <Show when={props.action}>
              {(action) => (
                <Button variant="primary" size="small" onClick={action().onClick}>
                  {action().label}
                </Button>
              )}
            </Show>
            <Show when={props.secondary}>
              {(secondary) => (
                <Button variant="ghost" size="small" onClick={secondary().onClick}>
                  {secondary().label}
                </Button>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
