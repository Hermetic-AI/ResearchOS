import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { Spinner } from "@opencode/ui/spinner"

export function PreviewPane(props: {
  data?: string
  target?: { page: number; x: number; y: number }
  onLocate: (position: { page: number; x: number; y: number }) => void
}) {
  let canvas!: HTMLCanvasElement
  let renderTask: { cancel: () => void; promise: Promise<unknown> } | undefined
  const [page, setPage] = createSignal(1)
  const [pages, setPages] = createSignal(0)
  const [scale, setScale] = createSignal(1.2)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string>()

  createEffect(() => {
    const data = props.data
    const requestedPage = props.target?.page ?? page()
    const zoom = scale()
    if (!data || !canvas) return
    let active = true
    setLoading(true)
    setError(undefined)
    void import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
      const document = await pdfjs.getDocument({ data: bytes }).promise
      if (!active) return
      setPages(document.numPages)
      const current = Math.min(Math.max(1, requestedPage), document.numPages)
      setPage(current)
      const pdfPage = await document.getPage(current)
      const viewport = pdfPage.getViewport({ scale: zoom })
      const context = canvas.getContext("2d")
      if (!context || !active) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      renderTask?.cancel()
      renderTask = pdfPage.render({ canvasContext: context, viewport, canvas })
      await renderTask.promise
    }).catch((cause) => {
      if (active && !(cause instanceof Error && cause.name === "RenderingCancelledException")) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }).finally(() => active && setLoading(false))
    onCleanup(() => {
      active = false
      renderTask?.cancel()
    })
  })

  return (
    <section class="flex h-full min-h-0 flex-col bg-background-stronger">
      <header class="flex h-9 shrink-0 items-center justify-between border-b border-border-weak-base px-3 text-11-regular text-text-weak">
        <span>PDF preview</span>
        <div class="flex items-center gap-2">
          <button class="hover:text-text-base disabled:opacity-40" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>Prev</button>
          <span>{pages() ? `${page()} / ${pages()}` : "No build"}</span>
          <button class="hover:text-text-base disabled:opacity-40" disabled={page() >= pages()} onClick={() => setPage(page() + 1)}>Next</button>
          <button class="hover:text-text-base" onClick={() => setScale(Math.max(0.7, scale() - 0.1))}>−</button>
          <span>{Math.round(scale() * 100)}%</span>
          <button class="hover:text-text-base" onClick={() => setScale(Math.min(2, scale() + 0.1))}>+</button>
        </div>
      </header>
      <div class="relative min-h-0 flex-1 overflow-auto p-5 text-center">
        <Show when={!props.data}>
          <div class="mx-auto mt-24 max-w-xs text-12-regular leading-5 text-text-weak">
            Compile the main document to load its PDF. The preview never fabricates a build when Tectonic is unavailable.
          </div>
        </Show>
        <Show when={error()}>{(message) => <p class="mt-12 text-12-regular text-text-on-critical-strong">{message()}</p>}</Show>
        <Show when={loading()}><Spinner class="absolute right-4 top-4 size-4" /></Show>
        <canvas
          ref={canvas}
          class="mx-auto bg-white shadow-lg"
          classList={{ hidden: !props.data }}
          onDblClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            props.onLocate({ page: page(), x: (event.clientX - rect.left) / scale(), y: (event.clientY - rect.top) / scale() })
          }}
        />
      </div>
    </section>
  )
}
