export type ConfigInvalidError = {
  name: "ConfigInvalidError"
  data: {
    path?: string
    message?: string
    issues?: Array<{ message: string; path: string[] }>
  }
}

export type ProviderModelNotFoundError = {
  name: "ProviderModelNotFoundError"
  data: {
    providerID: string
    modelID: string
    suggestions?: string[]
  }
}

export type UnknownServerError = {
  name: "UnknownError"
  data: {
    message?: string
    ref?: string
  }
}

type Translator = (key: string, vars?: Record<string, string | number>) => string

function tr(translator: Translator | undefined, key: string, text: string, vars?: Record<string, string | number>) {
  if (!translator) return text
  const out = translator(key, vars)
  if (!out || out === key) return text
  return out
}

export function formatServerError(error: unknown, translate?: Translator, fallback?: string) {
  const unwrapped = unwrapNamedError(error)
  if (isConfigInvalidErrorLike(unwrapped)) return parseReadableConfigInvalidError(unwrapped, translate)
  if (isProviderModelNotFoundErrorLike(unwrapped)) return parseReadableProviderModelNotFoundError(unwrapped, translate)
  if (isUnknownServerErrorLike(unwrapped)) return parseReadableUnknownServerError(unwrapped, translate)
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  if (fallback) return fallback
  return tr(translate, "error.chain.unknown", "Unknown error")
}

function unwrapNamedError(error: unknown): unknown {
  if (error instanceof Error && error.cause && typeof error.cause === "object" && "body" in error.cause) {
    return (error.cause as Record<string, unknown>).body
  }
  return error
}

// Client-synthesized session not-found errors share one constructor and
// predicate so the message contract cannot drift between the sync store
// (server-session.ts), the route lineage (session-lineage.ts), and the
// not-found fallback matching (session.tsx).
const sessionNotFoundMessage = (sessionID: string) => `Session not found: ${sessionID}`

export function sessionNotFoundError(sessionID: string) {
  return new Error(sessionNotFoundMessage(sessionID))
}

export function isLocalSessionNotFoundError(error: unknown, sessionID: string) {
  return error instanceof Error && error.message === sessionNotFoundMessage(sessionID)
}

export function isSessionNotFoundError(error: unknown, sessionID: string) {
  const unwrapped = unwrapNamedError(error)
  if (typeof unwrapped !== "object" || unwrapped === null) return false
  const value = unwrapped as Record<string, unknown>
  return value._tag === "SessionNotFoundError" && value.sessionID === sessionID
}

function isConfigInvalidErrorLike(error: unknown): error is ConfigInvalidError {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return o.name === "ConfigInvalidError" && typeof o.data === "object" && o.data !== null
}

function isProviderModelNotFoundErrorLike(error: unknown): error is ProviderModelNotFoundError {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return o.name === "ProviderModelNotFoundError" && typeof o.data === "object" && o.data !== null
}

function isUnknownServerErrorLike(error: unknown): error is UnknownServerError {
  if (typeof error !== "object" || error === null) return false
  const value = error as Record<string, unknown>
  return value.name === "UnknownError" && typeof value.data === "object" && value.data !== null
}

export function parseReadableConfigInvalidError(errorInput: ConfigInvalidError, translator?: Translator) {
  const file = errorInput.data.path && errorInput.data.path !== "config" ? errorInput.data.path : "config"
  const detail = errorInput.data.message?.trim() ?? ""
  const issues = (errorInput.data.issues ?? [])
    .map((issue) => {
      const msg = issue.message.trim()
      if (!issue.path.length) return msg
      return `${issue.path.join(".")}: ${msg}`
    })
    .filter(Boolean)
  const msg = issues.length ? issues.join("\n") : detail
  if (!msg) return tr(translator, "error.chain.configInvalid", `Config file at ${file} is invalid`, { path: file })
  return tr(translator, "error.chain.configInvalidWithMessage", `Config file at ${file} is invalid: ${msg}`, {
    path: file,
    message: msg,
  })
}

function parseReadableProviderModelNotFoundError(errorInput: ProviderModelNotFoundError, translator?: Translator) {
  const p = errorInput.data.providerID.trim()
  const m = errorInput.data.modelID.trim()
  const list = (errorInput.data.suggestions ?? []).map((v) => v.trim()).filter(Boolean)
  const body = tr(translator, "error.chain.modelNotFound", `Model not found: ${p}/${m}`, { provider: p, model: m })
  const tail = tr(translator, "error.chain.checkConfig", "Check your config (opencode.json) provider/model names")
  if (list.length) {
    const suggestions = list.slice(0, 5).join(", ")
    return [body, tr(translator, "error.chain.didYouMean", `Did you mean: ${suggestions}`, { suggestions }), tail].join(
      "\n",
    )
  }
  return [body, tail].join("\n")
}

export function parseReadableUnknownServerError(errorInput: UnknownServerError, translator?: Translator) {
  const message = researchosRecoveryMessage(errorInput.data.message?.trim() || tr(translator, "error.chain.unknown", "Unknown error"))
  const ref = errorInput.data.ref?.trim()
  if (!ref) return message
  return `${message}\n${tr(translator, "error.chain.reference", "Error reference: {{ref}}", { ref })}`
}

function researchosRecoveryMessage(message: string) {
  if (/tectonic.*(?:ENOENT|not found)|(?:ENOENT|not found).*tectonic/i.test(message)) {
    return "LaTeX compilation requires Tectonic. Install Tectonic, then run bun run researchos:doctor."
  }
  if (/LibreTranslate|translation service|ECONNREFUSED.*translate/i.test(message)) {
    return "Translation is unavailable. Configure LIBRETRANSLATE_URL, then run bun run researchos:doctor."
  }
  if (/(?:uv|python).*(?:ENOENT|not found)|(?:ENOENT|not found).*(?:uv|python)/i.test(message)) {
    return "Data analysis requires uv and Python. Install the missing runtime, then run bun run researchos:doctor."
  }
  return message
}
