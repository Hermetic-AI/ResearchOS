import { Button } from "@opencode/ui/button"
import { Spinner } from "@opencode/ui/spinner"
import { Show, createEffect, createMemo, createResource, onCleanup } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"
import { archivedPdfPath, readingNotePath } from "@/components/researchos/paper-context"
import { useResearchosShell } from "@/components/researchos/shell-context"

export function LiteraturePanel(props: { paperId?: string }) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const shell = useResearchosShell()
  const client = createMemo(() => createResearchosClient({
    baseUrl: sdk().url,
    fetch: platform.fetch,
    username: serverSDK().server.http.username,
    password: serverSDK().server.http.password,
  })["server.researchos-literature"])

  const [paper] = createResource(
    () => props.paperId,
    async (id) => client().get({ id, location: { directory: sdk().directory } }).then((result) => result.data),
  )
  const [note] = createResource(
    () => props.paperId,
    async (id) => {
      const path = readingNotePath(id)
      const result = await sdk().client.file.read({ path }).catch(() => undefined)
      return result?.data?.type === "text" ? result.data.content : undefined
    },
  )
  const [pdfPath] = createResource(
    () => paper(),
    async (value) => (value ? archivedPdfPath(sdk(), value) : undefined),
  )

  createEffect(() => {
    const current = paper()
    shell.setAgentContext(current ? { module: "literature", resource: current.id } : { module: "literature" })
  })
  onCleanup(() => shell.setAgentContext(undefined))

  const askAgent = () => {
    const current = paper()
    if (!current) return
    shell.setPendingPrompt(`@literature Explain the key contributions of ${current.title} (${current.id}).`)
    shell.setDockOpen(true)
  }

  return (
    <div class="flex h-full flex-col bg-background-base p-4">
      <Show when={paper.loading}><div class="flex justify-center p-8"><Spinner class="size-5" /></div></Show>
      <Show when={paper.error}><p class="text-12-regular text-text-on-critical-strong">{String(paper.error)}</p></Show>
      <Show when={paper()}>
        {(value) => (
          <div class="space-y-4">
            <div>
              <h2 class="text-14-medium text-text-base">{value().title}</h2>
              <p class="mt-1 text-11-regular text-text-weak">
                {value().authors.map((author) => author.name).join(", ")}
                {typeof value().year === "number" ? ` · ${value().year}` : ""}
              </p>
            </div>
            <Show when={value().abstract}>
              {(abstract) => <p class="text-12-regular leading-5 text-text-base">{abstract()}</p>}
            </Show>
            <Show when={note()}>
              {(content) => (
                <div class="rounded-md border border-border-weak-base bg-background-stronger p-3">
                  <p class="mb-2 text-10-medium uppercase tracking-wide text-text-weak">Reading note</p>
                  <pre class="whitespace-pre-wrap text-11-regular text-text-base">{content()}</pre>
                </div>
              )}
            </Show>
            <Show when={pdfPath()}>
              {(path) => <p class="font-mono text-10-regular text-text-weaker">{path()}</p>}
            </Show>
            <Button size="small" variant="secondary" onClick={askAgent}>Ask agent about this paper</Button>
          </div>
        )}
      </Show>
    </div>
  )
}
