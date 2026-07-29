import type { BibtexEntry } from "./types"

export function parseBibtex(content: string): BibtexEntry[] {
  const cleaned = content.replace(/(?<!\\)%.*$/gm, "")
  return entryBodies(cleaned).map(({ type, body }) => {
    const comma = body.indexOf(",")
    return {
      type,
      key: (comma === -1 ? body : body.slice(0, comma)).trim(),
      fields: parseFields(comma === -1 ? "" : body.slice(comma + 1)),
    }
  }).filter((entry) => entry.key.length > 0)
}

// 扫描 @type{...} 并做花括号配对（跳过转义），比纯正则对嵌套括号健壮
function entryBodies(content: string): Array<{ type: string; body: string }> {
  const out: Array<{ type: string; body: string }> = []
  const marker = /@(\w+)\s*\{/g
  let match = marker.exec(content)
  while (match) {
    const type = match[1]?.toLowerCase() ?? "misc"
    const start = match.index + match[0].length
    let depth = 1
    let index = start
    while (index < content.length && depth > 0) {
      const char = content[index]
      if (char === "\\") index += 1
      if (char === "{") depth += 1
      if (char === "}") depth -= 1
      index += 1
    }
    out.push({ type, body: content.slice(start, index - 1) })
    marker.lastIndex = index
    match = marker.exec(content)
  }
  return out
}

function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const pattern = /(\w+)\s*=\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\}|"([^"]*)"|([^,\n]+))/g
  Array.from(body.matchAll(pattern)).forEach((match) => {
    const name = match[1]
    const value = match[2] ?? match[3] ?? match[4]
    if (name && value !== undefined) fields[name.toLowerCase()] = value.trim()
  })
  return fields
}

const CITE_COMMANDS = /\\(?:cite|citet|citep|citealp|parencite|textcite)(?:\[[^\]]*\])*\{([^}]+)\}/g

export function extractCiteKeys(content: string): string[] {
  const keys = new Set<string>()
  Array.from(content.matchAll(CITE_COMMANDS)).forEach((match) => {
    ;(match[1] ?? "").split(",").map((key) => key.trim()).filter(Boolean).forEach((key) => keys.add(key))
  })
  return Array.from(keys)
}
