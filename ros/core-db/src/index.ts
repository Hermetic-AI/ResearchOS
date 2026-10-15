export * as CoreDb from "./index"

import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { dirname } from "path"

export type Role = "system" | "user" | "assistant" | "tool"

export interface Project {
  id: string
  name: string
  directory: string
  created_at: number
}

export interface Thread {
  id: string
  project_id: string
  title: string
  persona: string | null
  created_at: number
  updated_at: number
}

// One row maps 1:1 to a provider chat message so history can be replayed verbatim.
export interface MessageRow {
  id: number
  thread_id: string
  role: Role
  content: string | null
  tool_calls: string | null // JSON: { id, name, arguments }[]
  tool_call_id: string | null
  name: string | null
  created_at: number
}

export interface ToolCallRecord {
  id: string
  name: string
  arguments: string
}

export interface TraceEvent {
  id: number
  project_id: string
  thread_id: string | null
  ts: number
  kind: string
  subject_ref: string | null
  summary: string
  payload: string | null
}

export type HypothesisStatus = "open" | "supported" | "refuted" | "archived"

export interface Hypothesis {
  id: string
  project_id: string
  statement: string
  status: HypothesisStatus
  created_at: number
  updated_at: number
  support_count?: number
  refute_count?: number
}

export interface Evidence {
  id: number
  hypothesis_id: string
  kind: "support" | "refute"
  note: string
  paper_ref: string | null
  created_at: number
}

export interface Annotation {
  id: string
  project_id: string
  paper_ref: string
  page: number | null
  para: number | null
  quote: string | null
  note: string
  created_at: number
}

export interface Paper {
  id: string
  project_id: string
  title: string
  doi: string | null
  arxiv_id: string | null
  year: number | null
  venue: string | null
  abstract: string | null
  citation_count: number
  source: string
  authors: string // JSON: string[]
  is_read: number
  is_favorite: number
  created_at: number
  updated_at: number
}

export interface PaperParagraph {
  id: string
  paper_id: string
  seq: number
  page: number | null
  text: string
}

export interface PassageHit extends PaperParagraph {
  paper_title: string
}

export interface CitationEdge {
  from_id: string
  to_id: string
  context: string | null
  source: string
}

export interface PaperInput {
  title: string
  doi?: string | null
  arxivId?: string | null
  year?: number | null
  venue?: string | null
  abstract?: string | null
  citationCount?: number
  source?: string
  authors?: string[]
}

// Raw CSV is kept so any statistic can be recomputed later from the stored bytes.
export interface DatasetRow {
  id: string
  project_id: string
  name: string
  csv: string
  columns: string // JSON string[]
  row_count: number
  created_at: number
}

export interface AnalysisRow {
  id: string
  project_id: string
  dataset_id: string
  method: string
  x: string
  y: string
  pair_count: number
  statistic: number
  p_value: number
  significant: number
  payload: string // JSON StatTestResult
  created_at: number
}

// Ported from @researchos/literature so ids stay stable across the old and new engines.
export function computePaperId(doi: string | null, arxivId: string | null, title: string): string {
  const raw = (doi ?? arxivId ?? title.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")).toLowerCase()
  return new Bun.CryptoHasher("sha1").update(raw).digest("hex").slice(0, 8)
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  directory TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL DEFAULT '',
  persona TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content TEXT,
  tool_calls TEXT,
  tool_call_id TEXT,
  name TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id, updated_at);
CREATE TABLE IF NOT EXISTS trace_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  thread_id TEXT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  subject_ref TEXT,
  summary TEXT NOT NULL,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_trace_project ON trace_events(project_id, id);
CREATE TABLE IF NOT EXISTS hypotheses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','supported','refuted','archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hypothesis_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('support','refute')),
  note TEXT NOT NULL,
  paper_ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_hypothesis ON hypothesis_evidence(hypothesis_id, id);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  paper_ref TEXT NOT NULL,
  page INTEGER,
  para INTEGER,
  quote TEXT,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annotations_project ON annotations(project_id, paper_ref, id);
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  doi TEXT UNIQUE,
  arxiv_id TEXT,
  year INTEGER,
  venue TEXT,
  abstract TEXT,
  citation_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  authors TEXT NOT NULL DEFAULT '[]',
  is_read INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_papers_project ON papers(project_id, updated_at);
CREATE TABLE IF NOT EXISTS paper_paragraph (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  page INTEGER,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_para_paper ON paper_paragraph(paper_id, seq);
CREATE VIRTUAL TABLE IF NOT EXISTS paragraphs_fts USING fts5(
  text, content='paper_paragraph', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS paragraphs_ai AFTER INSERT ON paper_paragraph BEGIN
  INSERT INTO paragraphs_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS paragraphs_ad AFTER DELETE ON paper_paragraph BEGIN
  INSERT INTO paragraphs_fts(paragraphs_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER IF NOT EXISTS paragraphs_au AFTER UPDATE ON paper_paragraph BEGIN
  INSERT INTO paragraphs_fts(paragraphs_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO paragraphs_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TABLE IF NOT EXISTS citation_edges (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  context TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_edges_from ON citation_edges(from_id);
CREATE TABLE IF NOT EXISTS external_papers (
  id TEXT PRIMARY KEY,
  title TEXT,
  year INTEGER,
  doi TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
  title, abstract,
  content='papers', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS papers_ai AFTER INSERT ON papers BEGIN
  INSERT INTO papers_fts(rowid, title, abstract) VALUES (new.rowid, new.title, new.abstract);
END;
CREATE TRIGGER IF NOT EXISTS papers_ad AFTER DELETE ON papers BEGIN
  INSERT INTO papers_fts(papers_fts, rowid, title, abstract) VALUES ('delete', old.rowid, old.title, old.abstract);
END;
CREATE TRIGGER IF NOT EXISTS papers_au AFTER UPDATE ON papers BEGIN
  INSERT INTO papers_fts(papers_fts, rowid, title, abstract) VALUES ('delete', old.rowid, old.title, old.abstract);
  INSERT INTO papers_fts(rowid, title, abstract) VALUES (new.rowid, new.title, new.abstract);
END;
CREATE TABLE IF NOT EXISTS dataset (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  csv TEXT NOT NULL,
  columns TEXT NOT NULL DEFAULT '[]',
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dataset_project ON dataset(project_id, created_at);
CREATE TABLE IF NOT EXISTS analysis_result (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  dataset_id TEXT NOT NULL REFERENCES dataset(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  x TEXT NOT NULL,
  y TEXT NOT NULL,
  pair_count INTEGER NOT NULL,
  statistic REAL NOT NULL,
  p_value REAL NOT NULL,
  significant INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_result_project ON analysis_result(project_id, created_at);
`

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`
}

export class Db {
  private constructor(private readonly db: Database) {}

  static open(path: string): Db {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
    const db = new Database(path)
    db.exec("PRAGMA journal_mode = WAL;")
    db.exec("PRAGMA foreign_keys = ON;")
    db.exec(SCHEMA)
    return new Db(db)
  }

  close(): void {
    this.db.close()
  }

  createProject(name: string, directory: string): Project {
    const project: Project = { id: newId("prj"), name, directory, created_at: Date.now() }
    this.db
      .query("INSERT INTO projects (id, name, directory, created_at) VALUES (?, ?, ?, ?)")
      .run(project.id, project.name, project.directory, project.created_at)
    return project
  }

  getProject(id: string): Project | null {
    return (this.db.query("SELECT * FROM projects WHERE id = ?").get(id) as Project | null) ?? null
  }

  listProjects(): Project[] {
    return this.db.query("SELECT * FROM projects ORDER BY created_at ASC").all() as Project[]
  }

  createThread(projectId: string, title = "", persona: string | null = null): Thread {
    const now = Date.now()
    const thread: Thread = { id: newId("thr"), project_id: projectId, title, persona, created_at: now, updated_at: now }
    this.db
      .query(
        "INSERT INTO threads (id, project_id, title, persona, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(thread.id, thread.project_id, thread.title, thread.persona, thread.created_at, thread.updated_at)
    return thread
  }

  getThread(id: string): Thread | null {
    return (this.db.query("SELECT * FROM threads WHERE id = ?").get(id) as Thread | null) ?? null
  }

  renameThread(id: string, title: string): void {
    this.db.query("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?").run(title, Date.now(), id)
  }

  listThreads(projectId: string): Thread[] {
    return this.db
      .query("SELECT * FROM threads WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId) as Thread[]
  }

  appendMessage(
    threadId: string,
    message: {
      role: Role
      content?: string | null
      toolCalls?: ToolCallRecord[] | null
      toolCallId?: string | null
      name?: string | null
    },
  ): MessageRow {
    const row: MessageRow = {
      id: 0,
      thread_id: threadId,
      role: message.role,
      content: message.content ?? null,
      tool_calls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      tool_call_id: message.toolCallId ?? null,
      name: message.name ?? null,
      created_at: Date.now(),
    }
    const inserted = this.db
      .query(
        `INSERT INTO messages (thread_id, role, content, tool_calls, tool_call_id, name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .get(row.thread_id, row.role, row.content, row.tool_calls, row.tool_call_id, row.name, row.created_at) as MessageRow
    this.db.query("UPDATE threads SET updated_at = ? WHERE id = ?").run(Date.now(), threadId)
    return inserted
  }

  listMessages(threadId: string): MessageRow[] {
    return this.db
      .query("SELECT * FROM messages WHERE thread_id = ? ORDER BY id ASC")
      .all(threadId) as MessageRow[]
  }

  touchThread(id: string): void {
    this.db.query("UPDATE threads SET updated_at = ? WHERE id = ?").run(Date.now(), id)
  }

  appendTrace(event: {
    projectId: string
    threadId?: string | null
    kind: string
    subjectRef?: string | null
    summary: string
    payload?: unknown
  }): TraceEvent {
    const row: TraceEvent = {
      id: 0,
      project_id: event.projectId,
      thread_id: event.threadId ?? null,
      ts: Date.now(),
      kind: event.kind,
      subject_ref: event.subjectRef ?? null,
      summary: event.summary,
      payload: event.payload === undefined ? null : JSON.stringify(event.payload),
    }
    const inserted = this.db
      .query(
        `INSERT INTO trace_events (project_id, thread_id, ts, kind, subject_ref, summary, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        row.project_id,
        row.thread_id,
        row.ts,
        row.kind,
        row.subject_ref,
        row.summary,
        row.payload,
      ) as TraceEvent
    return inserted
  }

  listTrace(projectId: string, limit = 100): TraceEvent[] {
    return this.db
      .query("SELECT * FROM trace_events WHERE project_id = ? ORDER BY id DESC LIMIT ?")
      .all(projectId, limit) as TraceEvent[]
  }

  createHypothesis(projectId: string, statement: string): Hypothesis {
    const now = Date.now()
    const row: Hypothesis = { id: newId("hyp"), project_id: projectId, statement, status: "open", created_at: now, updated_at: now }
    this.db
      .query("INSERT INTO hypotheses (id, project_id, statement, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(row.id, row.project_id, row.statement, row.status, row.created_at, row.updated_at)
    return row
  }

  listHypotheses(projectId: string): Hypothesis[] {
    return this.db
      .query(
        `SELECT h.*,
           (SELECT COUNT(*) FROM hypothesis_evidence e WHERE e.hypothesis_id = h.id AND e.kind = 'support') AS support_count,
           (SELECT COUNT(*) FROM hypothesis_evidence e WHERE e.hypothesis_id = h.id AND e.kind = 'refute') AS refute_count
         FROM hypotheses h WHERE h.project_id = ? ORDER BY h.updated_at DESC`,
      )
      .all(projectId) as Hypothesis[]
  }

  getHypothesis(id: string): Hypothesis | null {
    return (this.db.query("SELECT * FROM hypotheses WHERE id = ?").get(id) as Hypothesis | null) ?? null
  }

  updateHypothesis(id: string, patch: { statement?: string; status?: HypothesisStatus }): Hypothesis | null {
    const current = this.getHypothesis(id)
    if (current === null) return null
    const statement = patch.statement ?? current.statement
    const status = patch.status ?? current.status
    this.db.query("UPDATE hypotheses SET statement = ?, status = ?, updated_at = ? WHERE id = ?").run(statement, status, Date.now(), id)
    return this.getHypothesis(id)
  }

  deleteHypothesis(id: string): void {
    this.db.query("DELETE FROM hypotheses WHERE id = ?").run(id)
  }

  addEvidence(hypothesisId: string, evidence: { kind: "support" | "refute"; note: string; paperRef?: string | null }): Evidence {
    const row: Evidence = {
      id: 0,
      hypothesis_id: hypothesisId,
      kind: evidence.kind,
      note: evidence.note,
      paper_ref: evidence.paperRef ?? null,
      created_at: Date.now(),
    }
    const inserted = this.db
      .query("INSERT INTO hypothesis_evidence (hypothesis_id, kind, note, paper_ref, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *")
      .get(row.hypothesis_id, row.kind, row.note, row.paper_ref, row.created_at) as Evidence
    this.db.query("UPDATE hypotheses SET updated_at = ? WHERE id = ?").run(Date.now(), hypothesisId)
    return inserted
  }

  listEvidence(hypothesisId: string): Evidence[] {
    return this.db
      .query("SELECT * FROM hypothesis_evidence WHERE hypothesis_id = ? ORDER BY id ASC")
      .all(hypothesisId) as Evidence[]
  }

  createAnnotation(
    projectId: string,
    annotation: { paperRef: string; page?: number | null; para?: number | null; quote?: string | null; note: string },
  ): Annotation {
    const row: Annotation = {
      id: newId("ann"),
      project_id: projectId,
      paper_ref: annotation.paperRef,
      page: annotation.page ?? null,
      para: annotation.para ?? null,
      quote: annotation.quote ?? null,
      note: annotation.note,
      created_at: Date.now(),
    }
    this.db
      .query(
        "INSERT INTO annotations (id, project_id, paper_ref, page, para, quote, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(row.id, row.project_id, row.paper_ref, row.page, row.para, row.quote, row.note, row.created_at)
    return row
  }

  listAnnotations(projectId: string, paperRef?: string): Annotation[] {
    if (paperRef === undefined)
      return this.db
        .query("SELECT * FROM annotations WHERE project_id = ? ORDER BY paper_ref ASC, page ASC, id ASC")
        .all(projectId) as Annotation[]
    return this.db
      .query("SELECT * FROM annotations WHERE project_id = ? AND paper_ref = ? ORDER BY page ASC, id ASC")
      .all(projectId, paperRef) as Annotation[]
  }

  deleteAnnotation(id: string): void {
    this.db.query("DELETE FROM annotations WHERE id = ?").run(id)
  }

  addPaper(projectId: string, input: PaperInput): Paper {
    const now = Date.now()
    const id = computePaperId(input.doi ?? null, input.arxivId ?? null, input.title)
    const authors = JSON.stringify(input.authors ?? [])
    this.db
      .query(
        `INSERT INTO papers (id, project_id, title, doi, arxiv_id, year, venue, abstract, citation_count, source, authors, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           year = COALESCE(excluded.year, papers.year),
           venue = COALESCE(excluded.venue, papers.venue),
           abstract = COALESCE(excluded.abstract, papers.abstract),
           citation_count = MAX(excluded.citation_count, papers.citation_count),
           authors = CASE WHEN excluded.authors = '[]' THEN papers.authors ELSE excluded.authors END,
           updated_at = excluded.updated_at`,
      )
      .run(
        id,
        projectId,
        input.title,
        input.doi ?? null,
        input.arxivId ?? null,
        input.year ?? null,
        input.venue ?? null,
        input.abstract ?? null,
        input.citationCount ?? 0,
        input.source ?? "manual",
        authors,
        now,
        now,
      )
    return this.getPaper(id) as Paper
  }

  getPaper(id: string): Paper | null {
    return (this.db.query("SELECT * FROM papers WHERE id = ?").get(id) as Paper | null) ?? null
  }

  listPapers(projectId: string, limit = 200, offset = 0): Paper[] {
    return this.db
      .query("SELECT * FROM papers WHERE project_id = ? ORDER BY citation_count DESC, year DESC, updated_at DESC LIMIT ? OFFSET ?")
      .all(projectId, limit, offset) as Paper[]
  }

  updatePaper(id: string, patch: { isRead?: boolean; isFavorite?: boolean }): Paper | null {
    if (this.getPaper(id) === null) return null
    this.db
      .query("UPDATE papers SET is_read = COALESCE(?, is_read), is_favorite = COALESCE(?, is_favorite), updated_at = ? WHERE id = ?")
      .run(patch.isRead === undefined ? null : patch.isRead ? 1 : 0, patch.isFavorite === undefined ? null : patch.isFavorite ? 1 : 0, Date.now(), id)
    return this.getPaper(id)
  }

  deletePaper(id: string): void {
    this.db.query("DELETE FROM citation_edges WHERE from_id = ? OR to_id = ?").run(id, id)
    this.db.query("DELETE FROM papers WHERE id = ?").run(id)
  }

  // FTS5 gives ranked keyword recall; an empty token set or a no-match falls back to LIKE so CJK queries still return rows.
  searchPapers(projectId: string, query: string, limit = 50): Paper[] {
    const tokens = (query.match(/[\p{L}\p{N}]+/gu) ?? []).map((token) => `"${token.replaceAll('"', "")}"`)
    if (tokens.length > 0) {
      const matched = this.db
        .query(
          `SELECT p.* FROM papers_fts JOIN papers p ON p.rowid = papers_fts.rowid
           WHERE papers_fts MATCH ? AND p.project_id = ? ORDER BY rank LIMIT ?`,
        )
        .all(tokens.join(" AND "), projectId, limit) as Paper[]
      if (matched.length > 0) return matched
    }
    const like = `%${query.trim()}%`
    return this.db
      .query("SELECT * FROM papers WHERE project_id = ? AND (title LIKE ? OR abstract LIKE ?) ORDER BY citation_count DESC LIMIT ?")
      .all(projectId, like, like, limit) as Paper[]
  }

  // Whole-body replace: pasting full text re-segments the paper, so old paragraphs are dropped first.
  addParagraphs(paperId: string, paragraphs: Array<{ page?: number | null; text: string }>): PaperParagraph[] {
    const rows = paragraphs.filter((p) => p.text.trim() !== "").map((p, i) => ({
      id: newId("para"),
      paper_id: paperId,
      seq: i + 1,
      page: p.page ?? null,
      text: p.text.trim(),
    }))
    const insert = this.db.query("INSERT INTO paper_paragraph (id, paper_id, seq, page, text) VALUES (?, ?, ?, ?, ?)")
    this.db.transaction(() => {
      this.db.query("DELETE FROM paper_paragraph WHERE paper_id = ?").run(paperId)
      for (const row of rows) insert.run(row.id, row.paper_id, row.seq, row.page, row.text)
    })()
    return rows
  }

  listParagraphs(paperId: string): PaperParagraph[] {
    return this.db
      .query("SELECT * FROM paper_paragraph WHERE paper_id = ? ORDER BY seq ASC")
      .all(paperId) as PaperParagraph[]
  }

  // Same FTS-then-LIKE strategy as searchPapers, over the pasted body text.
  searchParagraphs(projectId: string, query: string, limit = 10): PassageHit[] {
    const tokens = (query.match(/[\p{L}\p{N}]+/gu) ?? []).map((token) => `"${token.replaceAll('"', "")}"`)
    if (tokens.length > 0) {
      const matched = this.db
        .query(
          `SELECT pp.*, p.title AS paper_title FROM paragraphs_fts
           JOIN paper_paragraph pp ON pp.rowid = paragraphs_fts.rowid
           JOIN papers p ON p.id = pp.paper_id
           WHERE paragraphs_fts MATCH ? AND p.project_id = ? ORDER BY rank LIMIT ?`,
        )
        .all(tokens.join(" AND "), projectId, limit) as PassageHit[]
      if (matched.length > 0) return matched
    }
    const like = `%${query.trim()}%`
    return this.db
      .query(
        `SELECT pp.*, p.title AS paper_title FROM paper_paragraph pp
         JOIN papers p ON p.id = pp.paper_id
         WHERE p.project_id = ? AND pp.text LIKE ? ORDER BY pp.paper_id, pp.seq LIMIT ?`,
      )
      .all(projectId, like, limit) as PassageHit[]
  }

  addCitation(fromId: string, toId: string, context: string | null = null, source = "manual"): void {
    this.db
      .query("INSERT OR IGNORE INTO citation_edges (from_id, to_id, context, source) VALUES (?, ?, ?, ?)")
      .run(fromId, toId, context, source)
  }

  upsertExternalPaper(paper: { id: string; title: string | null; year: number | null; doi: string | null }): void {
    this.db
      .query("INSERT OR IGNORE INTO external_papers (id, title, year, doi) VALUES (?, ?, ?, ?)")
      .run(paper.id, paper.title, paper.year, paper.doi)
  }

  // Starmap graph: library papers as nodes, citation edges whose target is also in the library as links.
  getGraph(projectId: string): { nodes: Paper[]; edges: CitationEdge[] } {
    const nodes = this.listPapers(projectId, 500, 0)
    const edges = this.db
      .query("SELECT e.* FROM citation_edges e JOIN papers p ON p.id = e.to_id WHERE p.project_id = ?")
      .all(projectId) as CitationEdge[]
    return { nodes, edges }
  }

  addDataset(projectId: string, name: string, csv: string, columns: string[], rowCount: number): DatasetRow {
    const dataset: DatasetRow = {
      id: newId("ds"),
      project_id: projectId,
      name,
      csv,
      columns: JSON.stringify(columns),
      row_count: rowCount,
      created_at: Date.now(),
    }
    this.db
      .query(
        "INSERT INTO dataset (id, project_id, name, csv, columns, row_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(dataset.id, dataset.project_id, dataset.name, dataset.csv, dataset.columns, dataset.row_count, dataset.created_at)
    return dataset
  }

  // The list view never needs the raw bytes, so csv is left out to keep responses small.
  listDatasets(projectId: string): Array<Omit<DatasetRow, "csv">> {
    return this.db
      .query(
        "SELECT id, project_id, name, columns, row_count, created_at FROM dataset WHERE project_id = ? ORDER BY created_at DESC",
      )
      .all(projectId) as Array<Omit<DatasetRow, "csv">>
  }

  getDataset(id: string): DatasetRow | null {
    return (this.db.query("SELECT * FROM dataset WHERE id = ?").get(id) as DatasetRow | null) ?? null
  }

  deleteDataset(id: string): void {
    this.db.query("DELETE FROM dataset WHERE id = ?").run(id)
  }

  addResult(result: {
    projectId: string
    datasetId: string
    method: string
    x: string
    y: string
    pairCount: number
    statistic: number
    pValue: number
    significant: boolean
    payload: unknown
  }): AnalysisRow {
    const row: AnalysisRow = {
      id: newId("res"),
      project_id: result.projectId,
      dataset_id: result.datasetId,
      method: result.method,
      x: result.x,
      y: result.y,
      pair_count: result.pairCount,
      statistic: result.statistic,
      p_value: result.pValue,
      significant: result.significant ? 1 : 0,
      payload: JSON.stringify(result.payload),
      created_at: Date.now(),
    }
    this.db
      .query(
        `INSERT INTO analysis_result (id, project_id, dataset_id, method, x, y, pair_count, statistic, p_value, significant, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.project_id,
        row.dataset_id,
        row.method,
        row.x,
        row.y,
        row.pair_count,
        row.statistic,
        row.p_value,
        row.significant,
        row.payload,
        row.created_at,
      )
    return row
  }

  listResults(projectId: string, limit = 50): AnalysisRow[] {
    return this.db
      .query("SELECT * FROM analysis_result WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(projectId, limit) as AnalysisRow[]
  }
}

export function parseToolCalls(row: MessageRow): ToolCallRecord[] {
  if (!row.tool_calls) return []
  return JSON.parse(row.tool_calls) as ToolCallRecord[]
}
