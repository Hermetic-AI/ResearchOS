import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Show, createEffect, createSignal } from "solid-js"

export type NotebookCellRow = {
  id: string
  position: number
  source: string
  status: "idle" | "running" | "success" | "error"
  stdout?: string
  stderr?: string
  durationMs?: number
}

export function NotebookCell(props: {
  cell: NotebookCellRow
  onSave: (source: string) => Promise<void>
  onRun: (source: string) => Promise<void>
}) {
  const [source, setSource] = createSignal(props.cell.source)
  const [saved, setSaved] = createSignal(props.cell.source)
  const [running, setRunning] = createSignal(false)

  createEffect(() => {
    if (props.cell.source === saved()) return
    setSource(props.cell.source)
    setSaved(props.cell.source)
  })

  const save = async () => {
    await props.onSave(source())
    setSaved(source())
  }

  const run = async () => {
    setRunning(true)
    await props.onRun(source()).then(() => setSaved(source())).finally(() => setRunning(false))
  }

  return (
    <article class="group overflow-hidden rounded-lg border border-border-weak-base bg-background-base shadow-sm focus-within:border-border-focus">
      <header class="flex h-9 items-center gap-2 border-b border-border-weak-base bg-background-stronger px-2">
        <span class="w-8 text-center font-mono text-10-regular text-text-weaker">[{props.cell.position + 1}]</span>
        <span class="text-10-medium uppercase tracking-wide text-text-weak">Python</span>
        <Show when={props.cell.durationMs !== undefined}><span class="text-10-regular text-text-weaker">{props.cell.durationMs} ms</span></Show>
        <span class="ml-auto text-10-regular" classList={{
          "text-text-on-success-strong": props.cell.status === "success",
          "text-text-on-critical-strong": props.cell.status === "error",
          "text-text-weak": props.cell.status === "idle",
        }}>{running() ? "running" : props.cell.status}</span>
        <Button size="small" variant="ghost" disabled={source() === saved() || running()} onClick={() => void save()}>Save</Button>
        <Button size="small" variant="primary" disabled={running()} onClick={() => void run()}>{running() ? <Spinner class="size-3" /> : "Run"}</Button>
      </header>
      <div class="grid grid-cols-[40px_1fr] bg-background-base">
        <pre class="select-none border-r border-border-weak-base py-3 text-right font-mono text-11-regular leading-5 text-text-weaker">{source().split("\n").map((_, index) => `${index + 1}\n`).join("")}</pre>
        <textarea
          class="min-h-32 w-full resize-y bg-transparent p-3 font-mono text-12-regular leading-5 text-text-base outline-none"
          value={source()}
          onInput={(event) => setSource(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return
            event.preventDefault()
            void run()
          }}
          spellcheck={false}
        />
      </div>
      <Show when={props.cell.stdout || props.cell.stderr}>
        <div class="border-t border-border-weak-base bg-background-stronger p-3 font-mono text-11-regular leading-5">
          <Show when={props.cell.stdout}><pre class="whitespace-pre-wrap text-text-base">{props.cell.stdout}</pre></Show>
          <Show when={props.cell.stderr}><pre class="mt-1 whitespace-pre-wrap text-text-on-critical-strong">{props.cell.stderr}</pre></Show>
        </div>
      </Show>
    </article>
  )
}
