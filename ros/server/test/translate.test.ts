import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { Config } from "@researchos/core-config"
import { Db } from "@researchos/core-db"
import { createApp, handleRequest } from "../src/index"

function tempApp() {
  const directory = mkdtempSync(join(tmpdir(), "ros-tr-"))
  const db = Db.open(join(directory, "test.db"))
  const project = db.createProject("p", directory)
  const config = { home: directory, provider: "mock", maxSteps: 8, providers: { mock: { kind: "mock" } } } as Config
  return { app: createApp({ config, db, project }), db }
}

async function call(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const response = await handleRequest(app, new Request(`http://x${path}`, init))
  return { status: response.status, body: (await response.json()) as unknown }
}

const SOURCE =
  "Score-based generative modeling treats data generation as a reverse-time stochastic differential equation, where the score function $\\nabla_x \\log p_t(x)$ guides the denoising steps. Figure 2 shows that 50 steps reach an FID of 2.20 on CIFAR-10 [12, 13]."
const SECOND =
  "Diffusion models approximate the data distribution by iteratively removing noise; our method instead learns a deterministic probability flow ODE, which keeps the same marginals while cutting the number of function evaluations to 10."
const DRAFT =
  "基于分数函数的生成建模把数据生成视为一个反向时间随机微分方程，得分函数 $\\nabla_x \\log p_t(x)$ 引导去噪步骤。图 2 显示 50 步在 CIFAR-10 上达到 FID 2.20 [12, 13]。"

const post = (payload: Record<string, unknown>) => ({ method: "POST", body: JSON.stringify(payload) })
const segment = (extra: Record<string, unknown> = {}) =>
  post({ paper: "arxiv:2011.13456", section: "4.1", seq: 1, page: 12, source: SOURCE, ...extra })

describe("glossary routes", () => {
  test("upserts a term, traces it and deletes by id", async () => {
    const { app, db } = tempApp()
    expect((await call(app, "/api/glossary", post({ source: "  " }))).status).toBe(400)
    await call(app, "/api/glossary", post({ source: "score function", target: "得分函数" }))
    const again = await call(app, "/api/glossary", post({ source: "score function", target: "评分函数", note: "课题组统一" }))
    const term = again.body as { id: string; target: string; note: string }
    expect(term.target).toBe("评分函数")
    expect(term.note).toBe("课题组统一")
    expect((await call(app, "/api/glossary")).body as unknown[]).toHaveLength(1)
    expect(db.listTrace(app.project.id).some((row) => row.kind === "translate" && row.summary.includes("术语表"))).toBe(true)
    expect((await call(app, `/api/glossary/${term.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await call(app, "/api/glossary")).body).toEqual([])
  })

  test("a term with no agreed translation is stored as pending", async () => {
    const { app } = tempApp()
    const created = await call(app, "/api/glossary", post({ source: "churn" }))
    expect((created.body as { target: string; id: string }).target).toBe("")
  })
})

describe("translation segment routes", () => {
  test("saving the same anchor rewrites one row and audits protected tokens", async () => {
    const { app, db } = tempApp()
    expect((await call(app, "/api/translate/segments", post({ paper: "p", section: "1" }))).status).toBe(400)
    const first = await call(app, "/api/translate/segments", segment())
    expect(first.status).toBe(200)
    expect((first.body as { segment: { status: string } }).segment.status).toBe("todo")
    const saved = await call(app, "/api/translate/segments", segment({ target: DRAFT, engine: "mock" }))
    const segmentRow = (saved.body as { segment: { status: string; engine: string } }).segment
    expect(segmentRow.status).toBe("draft")
    expect(segmentRow.engine).toBe("mock")
    const audit = (saved.body as { audit: { leaks: unknown[]; applied: string[] } }).audit
    expect(audit.leaks).toEqual([])
    expect(audit.applied).toEqual([])
    const draft = await call(app, "/api/translate/draft?paper=arxiv:2011.13456")
    expect((draft.body as { segments: unknown[] }).segments).toHaveLength(1)
    expect((draft.body as { paper: { title: string } }).paper.title).toBe("arxiv:2011.13456")
    expect(db.listTrace(app.project.id).filter((row) => row.kind === "translate")).toHaveLength(1)
    expect(db.listSegments(app.project.id, "arxiv:2011.13456")).toHaveLength(1)
  })

  test("a draft that drops the citation key and caption number reports both leaks", async () => {
    const { app } = tempApp()
    const saved = await call(
      app,
      "/api/translate/segments",
      segment({ target: "只保留得分函数 $\\nabla_x \\log p_t(x)$ 与 50 步在 CIFAR-10 上的 FID 2.20。" }),
    )
    const audit = (saved.body as { audit: { leaks: Array<{ kind: string; text: string }> } }).audit
    expect(audit.leaks.map((token) => token.kind)).toEqual(["cite", "caption"])
    expect(audit.leaks.map((token) => token.text)).toEqual(["[12, 13]", "Figure 2"])
  })

  test("draft rolls up section progress and glossary rail statuses", async () => {
    const { app } = tempApp()
    await call(app, "/api/glossary", post({ source: "score function", target: "得分函数" }))
    await call(app, "/api/glossary", post({ source: "probability flow ODE", target: "概率流 ODE" }))
    await call(app, "/api/translate/segments", segment({ target: DRAFT }))
    await call(app, "/api/translate/segments", segment({ seq: 2, page: 12, source: SECOND }))
    await call(app, "/api/translate/segments", post({ paper: "arxiv:2011.13456", section: "4.2", seq: 1, page: 13, source: "尾段。", target: "尾段译文。", status: "final" }))
    expect((await call(app, "/api/translate/draft")).status).toBe(400)
    const audit = (await call(app, "/api/translate/draft?paper=arxiv:2011.13456")).body as {
      audit: {
        segments: number
        translated: number
        sections: Array<{ section: string; total: number; final: number; draft: number; todo: number; protected: Record<string, number> }>
        terms: Array<{ source: string; target: string; note: string; count: number; status: string }>
        leaks: unknown[]
      }
    }
    expect(audit.audit.segments).toBe(3)
    expect(audit.audit.translated).toBe(2)
    expect(audit.audit.sections).toEqual([
      { section: "4.1", total: 2, final: 0, draft: 1, todo: 1, protected: { formula: 1, cite: 1, caption: 1, number: 4 } },
      { section: "4.2", total: 1, final: 1, draft: 0, todo: 0, protected: { formula: 0, cite: 0, caption: 0, number: 0 } },
    ])
    expect(audit.audit.terms).toEqual([
      { source: "score function", target: "得分函数", note: "", count: 1, status: "used" },
      { source: "probability flow ODE", target: "概率流 ODE", note: "", count: 0, status: "missing" },
    ])
    expect(audit.audit.leaks).toEqual([])
  })

  test("deleting a segment removes it from the draft", async () => {
    const { app, db } = tempApp()
    const saved = await call(app, "/api/translate/segments", segment())
    const id = (saved.body as { segment: { id: string } }).segment.id
    expect((await call(app, `/api/translate/segments/${id}`, { method: "DELETE" })).status).toBe(200)
    expect(db.listSegments(app.project.id, "arxiv:2011.13456")).toHaveLength(0)
  })
})

describe("library import and export", () => {
  test("imports pasted paragraphs into segments once and lists drafts", async () => {
    const { app, db } = tempApp()
    const paper = (await call(app, "/api/library", post({ title: "Denoising Diffusion RNNs", arxivId: "2011.13456", year: 2022 })))
      .body as { id: string }
    expect((await call(app, "/api/translate/import", post({ paper: paper.id }))).body).toEqual({ imported: 0, paragraphs: 0 })
    await call(app, `/api/library/${paper.id}/paragraphs`, post({ paragraphs: [{ page: 12, text: SOURCE }, { page: 13, text: SECOND }] }))
    expect((await call(app, "/api/translate/import", post({ paper: paper.id }))).body).toEqual({ imported: 2, paragraphs: 2 })
    expect((await call(app, "/api/translate/import", post({ paper: paper.id }))).body).toEqual({ imported: 0, paragraphs: 2 })
    const listed = (await call(app, "/api/translate/papers")).body as unknown as Array<Record<string, unknown>>
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ ref: paper.id, title: "Denoising Diffusion RNNs", segments: 2, translated: 0 })
    const detail = (await call(app, `/api/translate/draft?paper=${paper.id}`)).body as {
      paper: { title: string; arxiv_id: string | null; year: number | null }
      audit: { sections: Array<{ section: string; total: number; final: number; draft: number; todo: number; protected: Record<string, number> }> }
    }
    expect(detail.paper).toMatchObject({ title: "Denoising Diffusion RNNs", arxiv_id: "2011.13456", year: 2022 })
    expect(detail.audit.sections).toEqual([
      { section: "全文", total: 2, final: 0, draft: 0, todo: 2, protected: { formula: 1, cite: 1, caption: 1, number: 4 } },
    ])
    expect(db.listTrace(app.project.id).filter((row) => row.kind === "translate")).toHaveLength(3)
  })

  test("exports markdown and bilingual html as downloads", async () => {
    const { app } = tempApp()
    await call(app, "/api/translate/segments", segment({ target: DRAFT }))
    await call(app, "/api/translate/segments", segment({ seq: 2, source: "tail" }))
    const md = await handleRequest(app, new Request("http://x/api/translate/export?paper=arxiv:2011.13456"))
    expect(md.headers.get("content-type")).toContain("text/markdown")
    expect(md.headers.get("content-disposition")).toContain('filename="arxiv-2011.13456.md"')
    const markdown = await md.text()
    expect(markdown).toContain("已译 1/2 段")
    expect(markdown).toContain(DRAFT)
    const html = await handleRequest(app, new Request("http://x/api/translate/export?paper=arxiv:2011.13456&format=html"))
    expect(html.headers.get("content-type")).toContain("text/html")
    const body = await html.text()
    expect(body).toContain("<!DOCTYPE html>")
    expect(body).toContain("4.1 ¶1 · p.12")
    expect(body).toContain("data-status=\"draft\"")
  })
})
