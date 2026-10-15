import { describe, expect, test } from "bun:test"
import { Db } from "../src/index"

function seeded() {
  const db = Db.open(":memory:")
  const project = db.createProject("paper", "/tmp/paper")
  return { db, project }
}

describe("trace_events", () => {
  test("append then list newest-first with limit", () => {
    const { db, project } = seeded()
    db.appendTrace({ projectId: project.id, kind: "chat", summary: "first" })
    db.appendTrace({ projectId: project.id, kind: "chat", summary: "second" })
    const all = db.listTrace(project.id)
    expect(all.map((e) => e.summary)).toEqual(["second", "first"])
    expect(db.listTrace(project.id, 1).map((e) => e.summary)).toEqual(["second"])
    db.close()
  })

  test("serializes payload json and stores subject_ref", () => {
    const { db, project } = seeded()
    const row = db.appendTrace({
      projectId: project.id,
      kind: "skill_load",
      subjectRef: "pdf-notes",
      summary: "injected",
      payload: { tokens: 12 },
    })
    expect(row.subject_ref).toBe("pdf-notes")
    expect(JSON.parse(row.payload ?? "{}")).toEqual({ tokens: 12 })
    db.close()
  })
})

describe("hypotheses + evidence", () => {
  test("create lists with zero counts, update status, cascade delete evidence", () => {
    const { db, project } = seeded()
    const hyp = db.createHypothesis(project.id, "attention is sparse")
    expect(hyp.status).toBe("open")
    expect(db.listHypotheses(project.id)).toHaveLength(1)

    db.addEvidence(hyp.id, { kind: "support", note: "paper A shows 80% heads unused" })
    db.addEvidence(hyp.id, { kind: "refute", note: "paper B disagrees" })
    const listed = db.listHypotheses(project.id)[0]
    expect(listed?.support_count).toBe(1)
    expect(listed?.refute_count).toBe(1)

    const updated = db.updateHypothesis(hyp.id, { status: "supported" })
    expect(updated?.status).toBe("supported")

    expect(db.listEvidence(hyp.id)).toHaveLength(2)
    db.deleteHypothesis(hyp.id)
    expect(db.getHypothesis(hyp.id)).toBeNull()
    expect(db.listEvidence(hyp.id)).toHaveLength(0)
    db.close()
  })

  test("update on missing hypothesis returns null", () => {
    const db = Db.open(":memory:")
    expect(db.updateHypothesis("hyp_missing", { status: "archived" })).toBeNull()
    db.close()
  })
})

describe("annotations", () => {
  test("create, filter by paper, delete", () => {
    const { db, project } = seeded()
    db.createAnnotation(project.id, { paperRef: "vaswani2017", page: 3, note: "positional encoding fig" })
    db.createAnnotation(project.id, { paperRef: "vaswani2017", page: 1, quote: "we propose", note: "abstract" })
    db.createAnnotation(project.id, { paperRef: "chowdhury2020", note: "side note" })

    expect(db.listAnnotations(project.id)).toHaveLength(3)
    const one = db.listAnnotations(project.id, "vaswani2017")
    expect(one).toHaveLength(2)
    // ordered by page asc within a paper
    expect(one.map((a) => a.page)).toEqual([1, 3])

    db.deleteAnnotation(one[0]?.id ?? "")
    expect(db.listAnnotations(project.id, "vaswani2017")).toHaveLength(1)
    db.close()
  })
})

describe("papers library", () => {
  test("addPaper is idempotent on title and merges citation count", () => {
    const { db, project } = seeded()
    const first = db.addPaper(project.id, { title: "Attention Is All You Need", year: 2017, citationCount: 100, authors: ["Vaswani"] })
    const again = db.addPaper(project.id, { title: "Attention Is All You Need", year: 2017, citationCount: 150 })
    expect(again.id).toBe(first.id)
    expect(db.listPapers(project.id)).toHaveLength(1)
    expect(again.citation_count).toBe(150)
    expect(JSON.parse(again.authors)).toEqual(["Vaswani"])
    db.close()
  })

  test("search uses FTS5 for latin and falls back to LIKE for CJK", () => {
    const { db, project } = seeded()
    db.addPaper(project.id, { title: "Denoising Diffusion Probabilistic Models", abstract: "score matching", year: 2020 })
    db.addPaper(project.id, { title: "伪线性注意力综述", abstract: "高效长序列建模", year: 2024 })
    expect(db.searchPapers(project.id, "diffusion").map((p) => p.title)).toEqual(["Denoising Diffusion Probabilistic Models"])
    expect(db.searchPapers(project.id, "注意力").map((p) => p.title)).toEqual(["伪线性注意力综述"])
    db.close()
  })

  test("graph returns library nodes and cascades edges on delete", () => {
    const { db, project } = seeded()
    const a = db.addPaper(project.id, { title: "Paper A" })
    const b = db.addPaper(project.id, { title: "Paper B" })
    db.addCitation(a.id, b.id)
    const graph = db.getGraph(project.id)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toHaveLength(1)
    db.deletePaper(b.id)
    expect(db.getGraph(project.id).edges).toHaveLength(0)
    db.close()
  })

  test("updatePaper toggles flags and returns null when missing", () => {
    const { db, project } = seeded()
    const a = db.addPaper(project.id, { title: "Paper A" })
    expect(a.is_read).toBe(0)
    const updated = db.updatePaper(a.id, { isRead: true })
    expect(updated?.is_read).toBe(1)
    expect(db.updatePaper("nope", { isRead: true })).toBeNull()
    db.close()
  })

  test("addParagraphs replaces wholesale, numbers by seq, and skips blanks", () => {
    const { db, project } = seeded()
    const a = db.addPaper(project.id, { title: "Paper A" })
    const rows = db.addParagraphs(a.id, [{ text: "  first body  " }, { text: "  " }, { page: 2, text: "second body" }])
    expect(rows.map((r) => [r.seq, r.page, r.text])).toEqual([
      [1, null, "first body"],
      [2, 2, "second body"],
    ])
    const replaced = db.addParagraphs(a.id, [{ text: "only paragraph" }])
    expect(replaced).toHaveLength(1)
    expect(db.listParagraphs(a.id).map((p) => p.text)).toEqual(["only paragraph"])
    db.close()
  })

  test("paragraphs cascade away with the paper", () => {
    const { db, project } = seeded()
    const a = db.addPaper(project.id, { title: "Paper A" })
    db.addParagraphs(a.id, [{ text: "body one" }, { text: "body two" }])
    expect(db.listParagraphs(a.id)).toHaveLength(2)
    db.deletePaper(a.id)
    expect(db.listParagraphs(a.id)).toHaveLength(0)
    db.close()
  })

  test("searchParagraphs hits body via FTS, falls back to LIKE for CJK, and stays in sync after replace", () => {
    const { db, project } = seeded()
    const a = db.addPaper(project.id, { title: "长文综述" })
    db.addParagraphs(a.id, [
      { text: "引言部分讨论 quadratic cost of self-attention." },
      { page: 4, text: "第二段讲核函数近似。" },
    ])
    const latin = db.searchParagraphs(project.id, "quadratic")
    expect(latin).toHaveLength(1)
    expect(latin[0]?.paper_title).toBe("长文综述")
    expect(db.searchParagraphs(project.id, "核函数").map((p) => [p.seq, p.page])).toEqual([[2, 4]])
    db.addParagraphs(a.id, [{ text: "replacement only" }])
    expect(db.searchParagraphs(project.id, "quadratic")).toHaveLength(0)
    db.close()
  })
})

describe("dataset + analysis_result", () => {
  test("stores raw csv, keeps the list view csv-free, and round-trips columns json", () => {
    const { db, project } = seeded()
    const csv = "seed,x,y\n1,10,9\n2,12,10"
    const dataset = db.addDataset(project.id, "fid.csv", csv, ["seed", "x", "y"], 2)
    expect(dataset.id.startsWith("ds_")).toBe(true)
    const listed = db.listDatasets(project.id)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toEqual({
      id: dataset.id,
      project_id: project.id,
      name: "fid.csv",
      columns: '["seed","x","y"]',
      row_count: 2,
      created_at: dataset.created_at,
    })
    expect(db.getDataset(dataset.id)?.csv).toBe(csv)
    expect(db.getDataset("ds_missing")).toBeNull()
    db.close()
  })

  test("lists datasets newest-first and deletes explicitly", () => {
    const { db, project } = seeded()
    db.addDataset(project.id, "old.csv", "a\n1", ["a"], 1)
    db.addDataset(project.id, "new.csv", "b\n1", ["b"], 1)
    expect(db.listDatasets(project.id).map((d) => d.name)).toEqual(["new.csv", "old.csv"])
    const first = db.listDatasets(project.id)[1]
    if (first) db.deleteDataset(first.id)
    expect(db.listDatasets(project.id).map((d) => d.name)).toEqual(["new.csv"])
    db.close()
  })

  test("persists stat results and cascades them away with the dataset", () => {
    const { db, project } = seeded()
    const dataset = db.addDataset(project.id, "fid.csv", "x,y\n1,0\n2,1", ["x", "y"], 2)
    const row = db.addResult({
      projectId: project.id,
      datasetId: dataset.id,
      method: "paired_t",
      x: "x",
      y: "y",
      pairCount: 2,
      statistic: 5.0,
      pValue: 0.033,
      significant: true,
      payload: { t: 5, p: 0.033 },
    })
    expect(row.id.startsWith("res_")).toBe(true)
    expect(db.listResults(project.id)).toHaveLength(1)
    expect(JSON.parse(db.listResults(project.id)[0]?.payload ?? "{}")).toEqual({ t: 5, p: 0.033 })
    db.deleteDataset(dataset.id)
    expect(db.listResults(project.id)).toHaveLength(0)
    db.close()
  })
})
