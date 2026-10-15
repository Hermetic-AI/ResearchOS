import { Button } from "@opencode/ui/button"
import { createSignal } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { createResearchosClient } from "@/utils/researchos-client"

export function ToolMissingCard(props: { tool: string; error: string }) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const platform = usePlatform()
  const [installing, setInstalling] = createSignal(false)
  const [installed, setInstalled] = createSignal(false)
  const [failed, setFailed] = createSignal<string>()

  const install = async () => {
    setInstalling(true)
    setFailed(undefined)
    try {
      const client = createResearchosClient({
        baseUrl: sdk().url,
        fetch: platform.fetch,
        username: serverSDK().server.http.username,
        password: serverSDK().server.http.password,
      })
      const assetApi = client["server.researchos-assets"]
      const location = { directory: sdk().directory }
      await assetApi.presetInstall({ location, pack: "researchos-mcp", target: "project" })
      await assetApi.presetInstall({ location, pack: "researchos-agents", target: "project" })
      await assetApi.presetInstall({ location, pack: "researchos-skills", target: "project" })
      await sdk().client.mcp.connect({ name: props.tool }).catch(() => {})
      setInstalled(true)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div class="my-2 rounded-lg border border-border-weaker-base bg-surface-critical-weak p-3">
      <p class="text-11-medium text-text-base">Research tool not available</p>
      <p class="mt-1 text-11-regular text-text-weak">
        The tool <span class="font-mono text-text-base">{props.tool}</span> is not installed or failed to start.
      </p>
      <p class="mt-1 line-clamp-2 font-mono text-10-regular text-text-weaker">{props.error}</p>
      <div class="mt-2 flex items-center gap-2">
        <Button size="small" variant="primary" disabled={installing() || installed()} onClick={() => void install()}>
          {installed() ? "Installed" : installing() ? "Installing…" : "Install research tools"}
        </Button>
        {failed() && <span class="text-10-regular text-text-on-critical-strong">{failed()}</span>}
      </div>
    </div>
  )
}
