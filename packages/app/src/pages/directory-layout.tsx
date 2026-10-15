import { DataProvider } from "@opencode-ai/session-ui/context"
import { showToast } from "@/utils/toast"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { type Accessor, createEffect, createMemo, createResource, onCleanup, type ParentProps, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { LocalProvider } from "@/context/local"
import { SDKProvider } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { decode64 } from "@/utils/base64"
import { Schema } from "effect"
import type { ServerConnection } from "@/context/server"
import { sessionHref } from "@/utils/session-route"
import { useServerSync, useQueryOptions } from "@/context/server-sync"
// researchos:start
import { pathKey } from "@/utils/path-key"
import { useQuery } from "@tanstack/solid-query"
// researchos:end

export function DirectoryDataProvider(
  props: ParentProps<{
    directory: string | Accessor<string>
    draftID?: string
    server?: Accessor<ServerConnection.Key | undefined>
  }>,
) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const sync = useSync()
  const serverSync = useServerSync()
  const directory = () => (typeof props.directory === "function" ? props.directory() : props.directory)
  const slug = createMemo(() => base64Encode(directory()))
  const href = (sessionID: string) => {
    const server = props.server?.()
    if (server) return sessionHref(server, sessionID)
    return `/${slug()}/session/${sessionID}`
  }

  createEffect(() => {
    // A draft lives at /new-session?draftId=… and has no directory segment to normalize.
    if (props.draftID || props.server?.()) return
    const next = sync().data.path.directory
    if (!next || next === directory()) return
    const path = location.pathname.slice(slug().length + 1)
    navigate(`/${base64Encode(next)}${path}${location.search}${location.hash}`, { replace: true })
  })

  createResource(
    () => params.id,
    (id) =>
      sync()
        .session.sync(id)
        .catch(() => {}),
  )

  createEffect(() => {
    const sessionID = params.id
    if (!sessionID) return
    serverSync().session.pin(sessionID)
    onCleanup(() => serverSync().session.unpin(sessionID))
  })

  // researchos:start
  // On Windows the route can carry an 8.3 short path while the server reports the
  // canonical long form asynchronously; the redirect effect above then remounts the
  // whole subtree and kills in-flight work. Hold children until the canonical
  // directory is known so any redirect happens before routed content mounts. A
  // missing or failed path response still renders the route directory as-is.
  const queryOptions = useQueryOptions()
  const pathQuery = useQuery(() => ({
    ...queryOptions().path(pathKey(directory())),
    enabled: !props.draftID && !props.server?.(),
  }))
  const canonical = () => {
    if (props.draftID || props.server?.()) return true
    if (pathQuery.isPending) return false
    const next = pathQuery.data?.directory
    if (!next) return true
    return next === directory()
  }
  const settled = () => (canonical() ? directory() : undefined)
  // researchos:end

  return (
    <Show when={settled()} keyed>
      {(directory) => (
        <DataProvider
          data={sync().data}
          directory={directory}
          onNavigateToSession={(sessionID: string) => navigate(href(sessionID))}
          onSessionHref={href}
        >
          <LocalProvider>{props.children}</LocalProvider>
        </DataProvider>
      )}
    </Show>
  )
}

export const ProjectDirString = Schema.String.pipe(Schema.brand("ProjectDirString"))
export type ProjectDirString = Schema.Schema.Type<typeof ProjectDirString>

export function decodeDirectory(dir: string): ProjectDirString | undefined {
  const decoded = decode64(dir)
  if (!decoded) return
  return ProjectDirString.make(decoded)
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const language = useLanguage()
  const navigate = useNavigate()
  let invalid = ""

  const resolved = createMemo(() => {
    if (!params.dir) return ""
    return decodeDirectory(params.dir) ?? ""
  })

  createEffect(() => {
    const dir = params.dir
    if (!dir) return
    if (resolved()) {
      invalid = ""
      return
    }
    if (invalid === dir) return
    invalid = dir
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: language.t("directory.error.invalidUrl"),
    })
    navigate("/", { replace: true })
  })

  return (
    <Show when={resolved()} keyed>
      {(resolved) => (
        <SDKProvider directory={resolved}>
          <DirectoryDataProvider directory={resolved}>{props.children}</DirectoryDataProvider>
        </SDKProvider>
      )}
    </Show>
  )
}
