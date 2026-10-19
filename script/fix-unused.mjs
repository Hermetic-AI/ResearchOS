import { readFileSync, writeFileSync } from "node:fs"

const edits = [
  ["packages/researchos-literature/src/db.ts", "  constructor(private projectRoot: string) {", "  constructor(projectRoot: string) {"],
  [
    "packages/researchos-literature/src/export.ts",
    "interface BibtexEntry {\n  type: string\n  key: string\n  fields: Record<string, string>\n}\n\n",
    "",
  ],
  [
    "packages/researchos-literature/src/import.ts",
    'import { parseReferences, type ParsedReference } from "./pdf/references"',
    'import { parseReferences } from "./pdf/references"',
  ],
  ["packages/researchos-literature/src/zotero.ts", 'import type { PaperMeta } from "./types"\n', ""],
  ["packages/researchos-latex/src/format.ts", 'import { dirname, join, resolve, sep } from "path"', 'import { dirname, resolve, sep } from "path"'],
  [
    "packages/server/src/handlers/researchos-graph.ts",
    "function withStore<T>(run: (store: Store) => Promise<T>) {\n  return Effect.gen(function* () {\n    const location = yield* Location.Service\n    const existing = stores.get(location.directory)\n    const store = existing ?? openStore(location.directory)\n    if (!existing) stores.set(location.directory, store)\n    return yield* Effect.tryPromise({\n      try: async () => run(store),\n      catch: serverError,\n    })\n  })\n}\n\n",
    "",
  ],
]

for (const [file, from, to] of edits) {
  const raw = readFileSync(file, "utf8")
  const crlf = raw.includes("\r\n")
  const text = crlf ? raw.replaceAll("\r\n", "\n") : raw
  const count = text.split(from).length - 1
  if (count !== 1) {
    console.log(`SKIP ${file}: anchor found ${count}x`)
    continue
  }
  writeFileSync(file, crlf ? text.replace(from, to).replaceAll("\n", "\r\n") : text.replace(from, to))
  console.log(`OK ${file}`)
}
