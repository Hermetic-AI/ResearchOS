import type { ServerResearchosLiteratureGetOutput, ServerResearchosLiteratureReadOutput } from "@opencode/client"
import type { DirectorySDK } from "@/context/sdk"
import type { createResearchosClient } from "@/utils/researchos-client"

export type ResearchosLiteratureClient = ReturnType<typeof createResearchosClient>["server.researchos-literature"]
export type LiteraturePaper = ServerResearchosLiteratureGetOutput["data"]
export type PaperSection = ServerResearchosLiteratureReadOutput["data"]["sections"][number]

export type PaperContext = {
  readonly paper: LiteraturePaper
}

export const LIBRARY_ONLY_INSTRUCTION =
  "Use only the project literature library and knowledge graph as sources (via the literature/graph tools if available, or the paper's full text). Do not use web search or outside knowledge. State the source cite key for every claim."

// Best-effort: any failure yields undefined so callers fall back to plain prompts.
export async function fetchPaperContext(input: {
  readonly literature: ResearchosLiteratureClient
  readonly sdk: DirectorySDK
  readonly paperId: string
}): Promise<PaperContext | undefined> {
  const paper = await input.literature
    .get({ id: input.paperId, location: { directory: input.sdk.directory } })
    .then((result) => result.data)
    .catch(() => undefined)
  if (!paper) return undefined
  return { paper }
}

// Retrieval against the imported full text; any failure yields undefined so callers
// send the prompt without a retrieval block (the system prompt explains the fallback).
export async function fetchPaperSections(input: {
  readonly literature: ResearchosLiteratureClient
  readonly sdk: DirectorySDK
  readonly paperId: string
  readonly query: string
}): Promise<ServerResearchosLiteratureReadOutput["data"] | undefined> {
  return input.literature
    .read({ id: input.paperId, location: { directory: input.sdk.directory }, query: input.query })
    .then((result) => result.data)
    .catch(() => undefined)
}

const RETRIEVAL_BUDGET = 6000

export function formatRetrievedSections(paperId: string, sections: ReadonlyArray<PaperSection>) {
  const ranked = [...sections].sort((a, b) => Number(b.score) - Number(a.score))
  const blocks: string[] = []
  let total = 0
  for (const section of ranked) {
    const block = `[Retrieved from paper ${paperId} · section: ${section.section ?? "(no section)"} · score ${Number(section.score).toFixed(2)}]\n${section.text}`
    if (total > 0 && total + block.length > RETRIEVAL_BUDGET) continue
    blocks.push(block)
    total += block.length
  }
  return blocks.join("\n\n")
}

// Papers archive their PDF at .researchos/literature/pdfs/<year|unknown>/<paperId>.pdf
// (see packages/researchos-literature/src/import.ts); the API does not expose pdf_path,
// so we locate it through the file listing instead of guessing absolute paths.
// Returns the project-relative path when the PDF exists; the context panel shows it read-only.
export async function archivedPdfPath(sdk: DirectorySDK, paper: LiteraturePaper) {
  const nodes = await sdk.client.file
    .list({ path: `.researchos/literature/pdfs/${paperYear(paper)}` })
    .then((result) => result.data ?? [])
    .catch(() => undefined)
  const node = nodes?.find((item) => item.type === "file" && item.name === `${paper.id}.pdf`)
  if (!node) return undefined
  return `.researchos/literature/pdfs/${paperYear(paper)}/${paper.id}.pdf`
}

export function buildPaperSystem(input: {
  readonly paper: LiteraturePaper
  readonly directory: string
  readonly libraryOnly?: boolean
}) {
  const abstract = (input.paper.abstract ?? "").slice(0, 2000)
  const truncated = (input.paper.abstract ?? "").length > abstract.length ? "…" : ""
  const authors = input.paper.authors.map((author) => author.name).join(", ") || "Unknown authors"
  const base = `You are assisting with the paper "${input.paper.title}" (${input.paper.id}, ${paperYear(input.paper)}). Authors: ${authors}. Abstract: ${abstract}${truncated} The paper's full text is stored at .researchos/literature/text/${input.paper.id}.txt — read it with the read tool (in ranges for long papers) or grep it; if a literature_read tool is available, prefer it for semantic lookup. The user is viewing this paper in the ResearchOS literature module of project ${input.directory}. Answer with evidence from the paper; cite sections/pages when possible.`
  if (!input.libraryOnly) return base
  return `${base}\n\n${LIBRARY_ONLY_INSTRUCTION}`
}

// The agent writes the note itself through its write/edit tools. The file lands in
// notes/ at the project root — not .researchos/ — because the graph reindex watches
// project files and excludes .researchos/, so only notes/ gets indexed.
export const readingNotePath = (paperId: string) => `notes/literature/${paperId}.md`

export async function startReadingNoteSession(input: {
  readonly literature: ResearchosLiteratureClient
  readonly sdk: DirectorySDK
  readonly paperId: string
}): Promise<string> {
  const context = await fetchPaperContext({
    literature: input.literature,
    sdk: input.sdk,
    paperId: input.paperId,
  })
  if (!context) throw new Error("Paper details could not be loaded from the local server")
  const session = await input.sdk.client.session.create({
    title: `Reading note · ${context.paper.title.slice(0, 60)}`,
  })
  if (!session.data) throw new Error("Session creation returned no data")
  recordPaperSession(input.sdk.directory, input.paperId, session.data.id)
  const text = `The paper's full text is available at .researchos/literature/text/${context.paper.id}.txt — read it with the read tool (in ranges for long papers) before writing. Write a structured Chinese reading note for this paper: 摘要 / 研究问题 / 方法 / 创新点 / 局限性 / 延伸阅读问题 (3个). Save it as a Markdown file at notes/literature/${context.paper.id}.md in the project root, starting with YAML-ish frontmatter lines: cite key, title, paper id. Use the write tool to create the file, then reply with a one-paragraph summary.`
  await input.sdk.client.session.promptAsync({
    sessionID: session.data.id,
    system: buildPaperSystem({ paper: context.paper, directory: input.sdk.directory }),
    parts: [{ type: "text", text }],
  })
  return session.data.id
}

function paperYear(paper: LiteraturePaper) {
  if (typeof paper.year !== "number" || !Number.isFinite(paper.year)) return "unknown"
  return String(paper.year)
}

// Sessions that touched a paper (reading note, dock chats) are indexed in localStorage so
// the literature detail pane can link back to them; the store is the source of truth and
// ids missing from it are dropped when rendering.
const paperSessionsKey = (directory: string, paperId: string) => `researchos.paperSessions.${directory}.${paperId}`

export function readPaperSessions(directory: string, paperId: string): string[] {
  if (typeof localStorage === "undefined") return []
  const raw = localStorage.getItem(paperSessionsKey(directory, paperId))
  if (!raw) return []
  const parsed = parseJson(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is string => typeof item === "string")
}

export function recordPaperSession(directory: string, paperId: string, sessionID: string) {
  if (typeof localStorage === "undefined") return
  const existing = readPaperSessions(directory, paperId)
  if (existing.includes(sessionID)) return
  localStorage.setItem(paperSessionsKey(directory, paperId), JSON.stringify([...existing, sessionID]))
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
