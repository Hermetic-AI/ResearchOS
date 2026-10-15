export * as Server from "./index"

import { mkdirSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { type Config, resolveProvider } from "@researchos/core-config"
import { Db, type HypothesisStatus, type Project } from "@researchos/core-db"
import { createProvider } from "@researchos/core-provider"
import { type SkillRoot, CoreAgent } from "@researchos/core-agent"
import { Stats } from "./stats"

export interface AppDeps {
  config: Config
  db: Db
  project: Project
}

// Lab personas for the multi-agent workbench; the id is persisted in threads.persona.
export const PERSONAS = [
  { id: "lit", name: "文献研究员", char: "文", color: "accent", note: "精读 · 引用核对", prompt: "你是课题组的文献研究员：先调用 literature_search 找证据，回答中引用文献 id 与 ¶ 段落号，逐条给出支持/反驳。" },
  { id: "data", name: "数据分析师", char: "数", color: "amber", note: "统计检验 · 等价推导", prompt: "你是课题组的数据分析师：明确样本与检验方法，给出可复核的数字与置信区间，不确定时先说明缺什么数据。" },
  { id: "repro", name: "复现医生", char: "复", color: "moss", note: "跑码 · 数值对齐", prompt: "你是复现医生：用 read_file 核对代码/日志，对比原文数值，列出偏差与最可能的来源。" },
  { id: "graph", name: "图谱师", char: "图", color: "seal", note: "引用边 · 星图维护", prompt: "你是图谱师：关注论文间引用关系，建议用 /api/citations 补边，并指出孤立节点。" },
  { id: "trans", name: "学术翻译", char: "翻", color: "moss", note: "双语对照 · 术语表", prompt: "你是学术翻译：给出中英对照与术语表，术语分歧处标注候选并请求人工裁决。" },
  { id: "writer", name: "论文写作", char: "写", color: "ink", note: "章节初稿", prompt: "你是论文写作助理：基于文献检索结果起草段落，逐句可溯源到文献 id。" },
] as const

export type PersonaId = (typeof PERSONAS)[number]["id"]

export function openDb(config: Config): Db {
  const path = process.env.RESEARCHOS_DB ?? join(config.home, "ros.db")
  return Db.open(path)
}

// The default project anchors file access; it is created once per database.
export function ensureProject(db: Db, directory: string): Project {
  const existing = db.listProjects()[0]
  if (existing) return existing
  return db.createProject("default", directory)
}

// Mirrors opencode's skill layout so both engines read the same SKILL.md files during migration.
export function skillRoots(projectDir: string): SkillRoot[] {
  const roots: SkillRoot[] = [
    { dir: join(projectDir, ".opencode", "skills"), scope: "project" },
    { dir: join(projectDir, ".opencode", "skill"), scope: "project" },
    { dir: join(projectDir, ".claude", "skills"), scope: "project" },
    { dir: join(projectDir, ".agents", "skills"), scope: "project" },
    { dir: join(homedir(), ".config", "opencode", "skills"), scope: "global" },
  ]
  const extra = process.env.RESEARCHOS_SKILLS_DIR
  if (extra)
    for (const item of extra.split(delimiter()))
      if (item) roots.push({ dir: item, scope: "global" })
  return roots
}

function delimiter(): string {
  return process.platform === "win32" ? ";" : ":"
}

export function createApp(deps: AppDeps) {
  const { config, db, project } = deps
  const resolved = resolveProvider(config)
  const provider = createProvider(resolved.name, resolved.provider)
  const model = config.model ?? (resolved.provider.kind === "openai" ? resolved.provider.model : "mock")
  const tools = new CoreAgent.ToolRegistry()
  tools.register(CoreAgent.readFileTool(project.directory))
  tools.register(CoreAgent.searchLibraryTool(db, project.id))

  const roots = skillRoots(project.directory)
  const state: { skills: ReturnType<typeof CoreAgent.loadSkills> } = { skills: CoreAgent.loadSkills(roots) }
  const reload = () => {
    state.skills = CoreAgent.loadSkills(roots)
    tools.register(CoreAgent.loadSkillTool(state.skills))
  }
  reload()

  return {
    config,
    db,
    project,
    providerName: resolved.name,
    model,
    listTools: () => tools.specs().map((tool) => tool.name),
    health: () => ({ ok: true, provider: resolved.name, model, directory: project.directory, db: process.env.RESEARCHOS_DB ?? join(config.home, "ros.db"), tools: tools.specs().map((tool) => tool.name) }),
    listThreads: () => db.listThreads(project.id),
    createThread: (title: string, persona: string | null) => db.createThread(project.id, title, persona),
    getThread: (id: string) => db.getThread(id),
    listMessages: (id: string) => db.listMessages(id),
    listSkills: () =>
      state.skills.map((skill) => ({
        name: skill.name,
        description: skill.description ?? "",
        version: skill.version,
        scope: skill.scope,
        location: skill.location,
      })),
    // Staging → validate → place. Returns { ok } or { ok:false, problems } without writing.
    installSkill: (folder: string, markdown: string) => {
      const problems = CoreAgent.validateSkillMarkdown(markdown, folder)
      if (problems.length > 0) return { ok: false as const, problems }
      const dir = join(project.directory, ".opencode", "skills", folder)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, "SKILL.md"), markdown, "utf8")
      reload()
      db.appendTrace({ projectId: project.id, kind: "skill_load", subjectRef: folder, summary: `Installed skill "${folder}"` })
      return { ok: true as const, path: join(dir, "SKILL.md") }
    },
    listTrace: (limit?: number) => db.listTrace(project.id, limit),
    listHypotheses: () => db.listHypotheses(project.id),
    createHypothesis: (statement: string) => {
      const hypothesis = db.createHypothesis(project.id, statement)
      db.appendTrace({ projectId: project.id, kind: "hypothesis", subjectRef: hypothesis.id, summary: `提出假设：${statement.slice(0, 60)}` })
      return hypothesis
    },
    updateHypothesis: (id: string, patch: { statement?: string; status?: HypothesisStatus }) =>
      db.updateHypothesis(id, patch),
    deleteHypothesis: (id: string) => db.deleteHypothesis(id),
    getHypothesis: (id: string) => db.getHypothesis(id),
    listEvidence: (hypothesisId: string) => db.listEvidence(hypothesisId),
    addEvidence: (hypothesisId: string, body: { kind: "support" | "refute"; note: string; paperRef?: string | null }) => {
      const evidence = db.addEvidence(hypothesisId, body)
      db.appendTrace({
        projectId: project.id,
        kind: "evidence",
        subjectRef: hypothesisId,
        summary: `${body.kind === "support" ? "支持" : "反驳"}证据：${body.note.slice(0, 50)}`,
      })
      return evidence
    },
    listAnnotations: (paperRef?: string) => db.listAnnotations(project.id, paperRef),
    createAnnotation: (body: { paperRef: string; page?: number | null; para?: number | null; quote?: string | null; note: string }) => {
      const annotation = db.createAnnotation(project.id, body)
      db.appendTrace({ projectId: project.id, kind: "note", subjectRef: annotation.paper_ref, summary: `边注 @${body.paperRef}：${body.note.slice(0, 50)}` })
      return annotation
    },
    deleteAnnotation: (id: string) => db.deleteAnnotation(id),
    listPapers: () => db.listPapers(project.id),
    addPaper: (body: {
      title: string
      doi?: string | null
      arxivId?: string | null
      year?: number | null
      venue?: string | null
      abstract?: string | null
      citationCount?: number | null
      source?: string | null
      authors?: string[] | null
    }) => {
      const paper = db.addPaper(project.id, {
        title: body.title,
        doi: body.doi ?? null,
        arxivId: body.arxivId ?? null,
        year: body.year ?? null,
        venue: body.venue ?? null,
        abstract: body.abstract ?? null,
        citationCount: body.citationCount ?? 0,
        source: body.source ?? "manual",
        authors: body.authors ?? [],
      })
      db.appendTrace({
        projectId: project.id,
        kind: "literature",
        subjectRef: paper.id,
        summary: `收录文献：${body.title.slice(0, 60)}`,
      })
      return paper
    },
    getPaper: (id: string) => db.getPaper(id),
    updatePaper: (id: string, patch: { isRead?: boolean; isFavorite?: boolean }) => db.updatePaper(id, patch),
    deletePaper: (id: string) => db.deletePaper(id),
    addCitation: (fromId: string, toId: string) => db.addCitation(fromId, toId),
    listParagraphs: (paperId: string) => db.listParagraphs(paperId),
    addParagraphs: (paperId: string, paragraphs: Array<{ page?: number | null; text: string }>) => {
      const rows = db.addParagraphs(paperId, paragraphs)
      if (rows.length > 0)
        db.appendTrace({
          projectId: project.id,
          kind: "literature",
          subjectRef: paperId,
          summary: `导入 ${rows.length} 段全文：${db.getPaper(paperId)?.title.slice(0, 40) ?? paperId}`,
        })
      return rows
    },
    // Keyword recall via FTS5 over title/abstract plus pasted body paragraphs; semantic/vector ranking stays degraded.
    search: (query: string) => ({
      engine: "fts5" as const,
      degraded: true,
      results: db.searchPapers(project.id, query),
      passages: query.trim() === "" ? [] : db.searchParagraphs(project.id, query, 10),
    }),
    graph: () => db.getGraph(project.id),
    listJobs: () => db.listThreads(project.id).filter((thread) => thread.persona !== null),
    listDatasets: () =>
      db.listDatasets(project.id).map((row) => ({ ...row, columns: JSON.parse(row.columns) as string[] })),
    addDataset: (name: string, csv: string) => {
      const table = Stats.parseCsv(csv)
      if (table.rows.length === 0) return null
      const dataset = db.addDataset(project.id, name, csv, table.columns, table.rows.length)
      db.appendTrace({
        projectId: project.id,
        kind: "data",
        subjectRef: dataset.id,
        summary: `导入数据集 ${name}：${table.rows.length} 行 × ${table.columns.length} 列`,
      })
      return { dataset: { ...dataset, columns: table.columns }, profile: Stats.profile(table) }
    },
    dataset: (id: string) => {
      const row = db.getDataset(id)
      if (!row) return null
      const table = Stats.parseCsv(row.csv)
      return { dataset: { ...row, columns: table.columns }, profile: Stats.profile(table), rows: table.rows.slice(0, 50) }
    },
    deleteDataset: (id: string) => db.deleteDataset(id),
    runStatTest: (datasetId: string, x: string, y: string, alpha: number) => {
      const row = db.getDataset(datasetId)
      if (!row) return { ok: false as const, error: `数据集不存在：${datasetId}` }
      const outcome = Stats.pairedTTest(Stats.parseCsv(row.csv), x, y, alpha)
      if (!outcome.ok) return outcome
      const result = outcome.result
      db.addResult({
        projectId: project.id,
        datasetId,
        method: result.method,
        x: result.x,
        y: result.y,
        pairCount: result.n,
        statistic: result.t,
        pValue: result.p,
        significant: result.significant,
        payload: result,
      })
      db.appendTrace({
        projectId: project.id,
        kind: "data",
        subjectRef: datasetId,
        summary: `配对 t 检验 ${x} vs ${y}：t=${result.t.toFixed(3)} · p=${Stats.formatP(result.p)} · ${result.significant ? "显著" : "不显著"}（n=${result.n}）`,
      })
      return { ok: true as const, result, latex: Stats.toLatexTable(result) }
    },
    listResults: () =>
      db.listResults(project.id).map((row) => {
        const result = JSON.parse(row.payload) as Parameters<typeof Stats.toLatexTable>[0]
        return {
          id: row.id,
          dataset_id: row.dataset_id,
          method: row.method,
          x: row.x,
          y: row.y,
          pair_count: row.pair_count,
          significant: row.significant === 1,
          created_at: row.created_at,
          result,
          latex: Stats.toLatexTable(result),
        }
      }),
    createJob: (personaId: string, title: string, task: string) => {
      const persona = PERSONAS.find((p) => p.id === personaId)
      if (persona === undefined) return null
      const thread = db.createThread(project.id, title, persona.id)
      db.appendTrace({ projectId: project.id, threadId: thread.id, kind: "job", subjectRef: thread.id, summary: `派单 · ${persona.name}：${task.slice(0, 60)}` })
      return { thread, persona, task }
    },
    runMessage: (threadId: string, content: string, skill?: string) =>
      CoreAgent.runThread({
        db,
        threadId,
        provider,
        model,
        user: content,
        tools,
        system: systemFor(threadId),
        skills: state.skills,
        injectSkill: skill,
        maxSteps: config.maxSteps,
      }),
  }

  function systemFor(threadId: string): string {
    const base = CoreAgent.projectSystemPrompt(project.directory)
    const persona = PERSONAS.find((p) => p.id === db.getThread(threadId)?.persona)
    return persona === undefined ? base : `${base}\n\n# Persona\n${persona.prompt}`
  }
}

export type App = ReturnType<typeof createApp>

export async function handleRequest(app: App, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  if (method === "GET" && (path === "/" || path === "/index.html"))
    return new Response(Bun.file(join(import.meta.dir, "..", "public", "index.html")))
  const page = /^\/([\w.-]+\.html)$/.exec(path)?.[1]
  if (method === "GET" && page !== undefined)
    return new Response(Bun.file(join(import.meta.dir, "..", "public", page)))
  const asset = /^\/assets\/([\w.-]+\.(?:js|css|json))$/.exec(path)?.[1]
  if (method === "GET" && asset !== undefined)
    return new Response(Bun.file(join(import.meta.dir, "..", "public", "assets", asset)))
  if (method === "GET" && path === "/api/health") return Response.json(app.health())

  if (method === "GET" && path === "/api/skills") return Response.json(app.listSkills())
  if (method === "POST" && path === "/api/skills/install") {
    const body = (await request.json().catch(() => ({}))) as { folder?: string; markdown?: string }
    const folder = (body.folder ?? "").trim()
    if (!/^[\w.-]+$/.test(folder) || typeof body.markdown !== "string")
      return Response.json({ ok: false, problems: [{ message: "need a safe folder name and markdown string" }] }, { status: 400 })
    return Response.json(app.installSkill(folder, body.markdown))
  }

  if (method === "GET" && path === "/api/threads") return Response.json(app.listThreads())
  if (method === "POST" && path === "/api/threads") {
    const body = (await request.json().catch(() => ({}))) as { title?: string; persona?: string }
    return Response.json(app.createThread(body.title ?? "", body.persona ?? null))
  }

  const threadId = /^\/api\/threads\/([\w-]+)$/.exec(path)?.[1]
  if (method === "GET" && threadId !== undefined) {
    const thread = app.getThread(threadId)
    if (!thread) return Response.json({ error: "thread not found" }, { status: 404 })
    return Response.json({ thread, messages: app.listMessages(thread.id) })
  }

  const messageThreadId = /^\/api\/threads\/([\w-]+)\/messages$/.exec(path)?.[1]
  if (method === "POST" && messageThreadId !== undefined) return sseResponse(app, messageThreadId, request)

  if (method === "GET" && path === "/api/trace")
    return Response.json(app.listTrace(Number(url.searchParams.get("limit") ?? "100")))

  if (path === "/api/hypotheses" && method === "GET") return Response.json(app.listHypotheses())
  if (path === "/api/hypotheses" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { statement?: string }
    if (typeof body.statement !== "string" || body.statement.trim() === "")
      return Response.json({ error: "statement required" }, { status: 400 })
    return Response.json(app.createHypothesis(body.statement.trim()))
  }

  const evidenceMatch = /^\/api\/hypotheses\/([\w-]+)\/evidence$/.exec(path)
  if (evidenceMatch?.[1] !== undefined) {
    const id = evidenceMatch[1]
    if (method === "GET") return Response.json(app.listEvidence(id))
    if (method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { kind?: string; note?: string; paperRef?: string }
      if (body.kind !== "support" && body.kind !== "refute")
        return Response.json({ error: "kind must be support|refute" }, { status: 400 })
      if (typeof body.note !== "string" || body.note.trim() === "")
        return Response.json({ error: "note required" }, { status: 400 })
      return Response.json(app.addEvidence(id, { kind: body.kind, note: body.note.trim(), paperRef: body.paperRef ?? null }))
    }
  }

  const hypothesisMatch = /^\/api\/hypotheses\/([\w-]+)$/.exec(path)
  if (hypothesisMatch?.[1] !== undefined) {
    const id = hypothesisMatch[1]
    if (method === "PATCH") {
      const body = (await request.json().catch(() => ({}))) as { statement?: string; status?: HypothesisStatus }
      const updated = app.updateHypothesis(id, { statement: body.statement, status: body.status })
      return updated ? Response.json(updated) : Response.json({ error: "hypothesis not found" }, { status: 404 })
    }
    if (method === "DELETE") {
      app.deleteHypothesis(id)
      return Response.json({ ok: true })
    }
  }

  if (path === "/api/annotations" && method === "GET")
    return Response.json(app.listAnnotations(url.searchParams.get("paper") ?? undefined))
  if (path === "/api/annotations" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      paperRef?: string
      page?: number
      para?: number
      quote?: string
      note?: string
    }
    if (typeof body.paperRef !== "string" || typeof body.note !== "string" || body.note.trim() === "")
      return Response.json({ error: "paperRef and note required" }, { status: 400 })
    return Response.json(
      app.createAnnotation({ paperRef: body.paperRef, page: body.page ?? null, para: body.para ?? null, quote: body.quote ?? null, note: body.note.trim() }),
    )
  }

  const annotationMatch = /^\/api\/annotations\/([\w-]+)$/.exec(path)
  if (annotationMatch?.[1] !== undefined && method === "DELETE") {
    app.deleteAnnotation(annotationMatch[1])
    return Response.json({ ok: true })
  }

  if (path === "/api/lab/roster" && method === "GET")
    return Response.json(PERSONAS.map((p) => ({ id: p.id, name: p.name, char: p.char, color: p.color, note: p.note })))
  if (path === "/api/lab/jobs" && method === "GET") return Response.json(app.listJobs())
  if (path === "/api/lab/jobs" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { persona?: string; title?: string; task?: string }
    const task = (body.task ?? "").trim()
    if (typeof body.persona !== "string" || task === "")
      return Response.json({ error: "persona and task required" }, { status: 400 })
    const created = app.createJob(body.persona, (body.title ?? "").trim() || task.slice(0, 24), task)
    if (created === null) return Response.json({ error: `unknown persona ${body.persona}` }, { status: 400 })
    return Response.json({ thread: created.thread, persona: created.persona.name, task })
  }

  if (path === "/api/notebook/datasets" && method === "GET") return Response.json(app.listDatasets())
  if (path === "/api/notebook/datasets" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { name?: string; csv?: string }
    const csv = (body.csv ?? "").trim()
    if (csv === "") return Response.json({ error: "csv required" }, { status: 400 })
    const created = app.addDataset((body.name ?? "").trim() || "dataset.csv", csv)
    if (!created) return Response.json({ error: "csv 没有数据行：至少需要表头加一行" }, { status: 400 })
    return Response.json(created)
  }

  const datasetMatch = /^\/api\/notebook\/datasets\/([\w-]+)$/.exec(path)
  if (datasetMatch?.[1] !== undefined) {
    const id = datasetMatch[1]
    if (method === "GET") {
      const detail = app.dataset(id)
      return detail ? Response.json(detail) : Response.json({ error: "dataset not found" }, { status: 404 })
    }
    if (method === "DELETE") {
      app.deleteDataset(id)
      return Response.json({ ok: true })
    }
  }

  if (path === "/api/notebook/results" && method === "GET") return Response.json(app.listResults())
  if (path === "/api/notebook/tests" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { dataset?: string; x?: string; y?: string; alpha?: number }
    if (typeof body.dataset !== "string" || typeof body.x !== "string" || typeof body.y !== "string")
      return Response.json({ error: "dataset, x and y required" }, { status: 400 })
    const alpha = typeof body.alpha === "number" && body.alpha > 0 && body.alpha < 1 ? body.alpha : 0.05
    const outcome = app.runStatTest(body.dataset, body.x, body.y, alpha)
    if (!outcome.ok) return Response.json({ error: outcome.error }, { status: 400 })
    return Response.json({ result: outcome.result, latex: outcome.latex })
  }

  if (path === "/api/library" && method === "GET") return Response.json(app.listPapers())
  if (path === "/api/library" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { title?: string }
    if (typeof body.title !== "string" || body.title.trim() === "")
      return Response.json({ error: "title required" }, { status: 400 })
    return Response.json(app.addPaper({ ...body, title: body.title.trim() }))
  }

  if (path === "/api/citations" && method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { fromId?: string; toId?: string }
    if (typeof body.fromId !== "string" || typeof body.toId !== "string")
      return Response.json({ error: "fromId and toId required" }, { status: 400 })
    app.addCitation(body.fromId, body.toId)
    return Response.json({ ok: true })
  }

  if (path === "/api/search" && method === "GET")
    return Response.json(app.search(url.searchParams.get("q") ?? ""))
  if (path === "/api/graph" && method === "GET") return Response.json(app.graph())

  const paragraphMatch = /^\/api\/library\/([\w-]+)\/paragraphs$/.exec(path)
  if (paragraphMatch?.[1] !== undefined) {
    const id = paragraphMatch[1]
    if (!app.getPaper(id)) return Response.json({ error: "paper not found" }, { status: 404 })
    if (method === "GET") return Response.json(app.listParagraphs(id))
    if (method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        paragraphs?: Array<{ page?: number | null; text?: string }>
      }
      if (!Array.isArray(body.paragraphs)) return Response.json({ error: "paragraphs array required" }, { status: 400 })
      const items = body.paragraphs
        .map((p) => ({ page: typeof p.page === "number" ? p.page : null, text: (p.text ?? "").trim() }))
        .filter((p) => p.text !== "")
      if (items.length === 0) return Response.json({ error: "no non-empty paragraphs" }, { status: 400 })
      return Response.json(app.addParagraphs(id, items))
    }
  }

  const paperMatch = /^\/api\/library\/([\w-]+)$/.exec(path)
  if (paperMatch?.[1] !== undefined) {
    const id = paperMatch[1]
    if (method === "GET") {
      const paper = app.getPaper(id)
      return paper ? Response.json(paper) : Response.json({ error: "paper not found" }, { status: 404 })
    }
    if (method === "PATCH") {
      const body = (await request.json().catch(() => ({}))) as { isRead?: boolean; isFavorite?: boolean }
      const updated = app.updatePaper(id, { isRead: body.isRead, isFavorite: body.isFavorite })
      return updated ? Response.json(updated) : Response.json({ error: "paper not found" }, { status: 404 })
    }
    if (method === "DELETE") {
      app.deletePaper(id)
      return Response.json({ ok: true })
    }
  }

  return Response.json({ error: "not found" }, { status: 404 })
}

function sseResponse(app: App, threadId: string, request: Request): Response {
  const thread = app.getThread(threadId)
  if (!thread) return Response.json({ error: "thread not found" }, { status: 404 })
  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          const body = (await request.json()) as { content?: string; skill?: string }
          if (typeof body.content !== "string" || body.content === "")
            throw new Error("missing content")
          if (thread.title === "") app.db.renameThread(thread.id, body.content.slice(0, 40))
          for await (const event of app.runMessage(thread.id, body.content, body.skill))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          controller.enqueue(encoder.encode("data: {\"type\":\"done\"}\n\n"))
        } catch (error) {
          const payload = { type: "error", message: error instanceof Error ? error.message : String(error) }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        }
        controller.close()
      },
    }),
    { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } },
  )
}
