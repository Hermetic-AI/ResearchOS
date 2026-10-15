export type PanelMode = "auto" | "confirm" | "badge"

export type PanelDirective = {
  readonly panel: string
  readonly resource?: string
  readonly mode: PanelMode
}

// Tool results can carry a UI directive either in the MCP metadata field or
// embedded in the JSON text content (for Python MCP servers that cannot set
// CallToolResult metadata directly).
export function parsePanelDirective(metadata: unknown, output?: string): PanelDirective | undefined {
  const fromMetadata = extractDirective(metadata)
  if (fromMetadata) return fromMetadata
  if (!output) return undefined
  return extractFromText(output)
}

function extractDirective(value: unknown): PanelDirective | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  const ui = record["researchos.ui"]
  return coerceDirective(ui)
}

function extractFromText(text: string): PanelDirective | undefined {
  // Fast path: the whole output is JSON.
  const direct = parseJson(text)
  const directResult = direct ? extractDirective(direct) ?? coerceDirective(direct["researchos.ui"]) : undefined
  if (directResult) return directResult

  // Fallback: scan for a JSON object inside the text (e.g. log lines before/after JSON).
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return undefined
  const candidate = text.slice(start, end + 1)
  const parsed = parseJson(candidate)
  return parsed ? extractDirective(parsed) ?? coerceDirective(parsed["researchos.ui"]) : undefined
}

function coerceDirective(value: unknown): PanelDirective | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  const panel = record.panel
  const mode = record.mode
  if (typeof panel !== "string" || !panel) return undefined
  if (mode !== "auto" && mode !== "confirm" && mode !== "badge") return undefined
  const resource = record.resource
  return {
    panel,
    resource: typeof resource === "string" ? resource : undefined,
    mode,
  }
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}
