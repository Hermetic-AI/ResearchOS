import { z } from "zod"
import { LiteratureService } from "./service"

const SearchInput = z.object({
  query: z.string().min(1),
  sources: z.array(z.enum(["arxiv", "semantic_scholar", "crossref", "pubmed"])).optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

const GetInput = z.object({ id: z.string().min(1) })
const ExportInput = z.object({
  paperIds: z.array(z.string().min(1)).min(1),
  format: z.enum(["bibtex", "ris", "endnote", "json", "markdown"]).default("bibtex"),
  style: z.enum(["ieee", "acm", "apa", "nature", "springer"]).optional(),
})
const ImportZoteroInput = z.object({ path: z.string().min(1) })
const ImportInput = z.object({
  path: z.string().optional(),
  url: z.string().optional(),
})
const CitationsInput = z.object({
  paperId: z.string().min(1),
  direction: z.enum(["references", "cited_by"]),
})
const RecommendInput = z.object({
  paperId: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
})
const ReadInput = z.object({
  paperId: z.string().min(1),
  query: z.string().min(1),
  k: z.number().int().min(1).max(50).default(6),
})

const command = process.argv[2]
const input: unknown = JSON.parse(await Bun.stdin.text())
const library = await LiteratureService.open(process.env.RESEARCHOS_PROJECT_ROOT ?? process.cwd())

try {
  if (command === "search") {
    const payload = SearchInput.parse(input)
    console.log(JSON.stringify({ results: await library.search(payload.query, payload) }))
  } else if (command === "get") {
    const payload = GetInput.parse(input)
    const paper = library.get(payload.id)
    if (!paper) throw new Error(`Unknown paper: ${payload.id}`)
    console.log(JSON.stringify(paper))
  } else if (command === "export") {
    const payload = ExportInput.parse(input)
    console.log(JSON.stringify({ content: await library.export(payload.paperIds, payload.format, payload.style), format: payload.format }))
  } else if (command === "import") {
    const payload = ImportInput.parse(input)
    console.log(JSON.stringify(await library.importPdf(payload)))
  } else if (command === "import-zotero") {
    const payload = ImportZoteroInput.parse(input)
    console.log(JSON.stringify(await library.importZotero(payload.path)))
  } else if (command === "citations") {
    const payload = CitationsInput.parse(input)
    console.log(JSON.stringify({ results: await library.getCitations(payload.paperId, payload.direction) }))
  } else if (command === "recommend") {
    const payload = RecommendInput.parse(input)
    console.log(JSON.stringify(await library.recommendSimilar(payload.paperId, payload.limit)))
  } else if (command === "read") {
    const payload = ReadInput.parse(input)
    console.log(JSON.stringify(await library.read(payload.paperId, payload.query, payload.k)))
  } else {
    throw new Error(`Unknown literature command: ${command ?? ""}`)
  }
} finally {
  library.close()
}
