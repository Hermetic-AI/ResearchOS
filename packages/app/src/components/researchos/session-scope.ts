export type SessionScope = {
  readonly module: string
  readonly resource?: string
}

// Sessions opened from ResearchOS surfaces are discoverable in localStorage:
// - agent-dock writes researchos.dockSession.<directory>:<module>:<resource|general> → sessionID
// - paper-context writes researchos.paperSessions.<directory>.<paperId> → sessionID[]
// The reverse map (sessionID → scope) is rebuilt lazily per directory with a short TTL
// so per-row lookups stay cheap without listening for storage events (same-tab writes
// do not fire them anyway).
const CACHE_TTL = 2_000
const cache = new Map<string, { at: number; map: Map<string, SessionScope> }>()

export function lookupSessionScope(directory: string, sessionID: string): SessionScope | undefined {
  if (typeof localStorage === "undefined") return undefined
  const now = Date.now()
  const cached = cache.get(directory)
  if (cached && now - cached.at < CACHE_TTL) return cached.map.get(sessionID)
  const map = buildScopeMap(directory)
  cache.set(directory, { at: now, map })
  return map.get(sessionID)
}

function buildScopeMap(directory: string) {
  const map = new Map<string, SessionScope>()
  const dockPrefix = `researchos.dockSession.${directory}:`
  const paperPrefix = `researchos.paperSessions.${directory}.`
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key) continue
    if (key.startsWith(dockPrefix)) {
      const sessionID = localStorage.getItem(key)
      const [module, ...rest] = key.slice(dockPrefix.length).split(":")
      if (!sessionID || !module) continue
      const resource = rest.join(":")
      map.set(sessionID, resource && resource !== "general" ? { module, resource } : { module })
      continue
    }
    if (!key.startsWith(paperPrefix)) continue
    const paperId = key.slice(paperPrefix.length)
    const raw = localStorage.getItem(key)
    if (!paperId || !raw) continue
    const parsed = parseJson(raw)
    if (!Array.isArray(parsed)) continue
    for (const item of parsed) {
      // Dock entries win over the paper index when a session appears in both.
      if (typeof item === "string" && !map.has(item)) map.set(item, { module: "literature", resource: paperId })
    }
  }
  return map
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
