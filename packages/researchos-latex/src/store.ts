import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { dirname, join } from "path"

const DDL = `
CREATE TABLE IF NOT EXISTS latex_build (
  id          TEXT PRIMARY KEY,
  main_file   TEXT NOT NULL,
  status      TEXT NOT NULL,
  pdf_path    TEXT,
  log         TEXT NOT NULL,
  duration_ms INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_latex_build_created ON latex_build(created_at);
CREATE TABLE IF NOT EXISTS latex_format_issue (
  id         TEXT PRIMARY KEY,
  main_file  TEXT NOT NULL,
  file       TEXT NOT NULL,
  line       INTEGER NOT NULL,
  rule       TEXT NOT NULL,
  severity   TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_latex_issue_file ON latex_format_issue(main_file, created_at);
`

export interface BuildRecordInput {
  mainFile: string
  status: "success" | "failed" | "unavailable"
  pdfPath?: string
  log: string
  durationMs?: number
}

export interface FormatIssueRecord {
  file: string
  line: number
  rule: string
  severity: "error" | "warning" | "info"
  message: string
}

export class LatexStore {
  private db: Database

  constructor(projectRoot: string) {
    const path = join(projectRoot, ".researchos", "latex", "latex.db")
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path, { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    DDL.split(";").map((statement) => statement.trim()).filter(Boolean).forEach((statement) => this.db.run(`${statement};`))
  }

  recordBuild(input: BuildRecordInput) {
    const id = crypto.randomUUID()
    this.db.prepare(`
      INSERT INTO latex_build (id, main_file, status, pdf_path, log, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.mainFile, input.status, input.pdfPath ?? null, input.log, input.durationMs ?? null, Date.now())
    return { id }
  }

  recordFormatIssues(mainFile: string, issues: FormatIssueRecord[]) {
    const createdAt = Date.now()
    this.db.transaction((records: FormatIssueRecord[]) => records.forEach((issue) => this.db.prepare(`
      INSERT INTO latex_format_issue (id, main_file, file, line, rule, severity, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), mainFile, issue.file, issue.line, issue.rule, issue.severity, issue.message, createdAt)))(issues)
  }

  listBuilds(limit = 20) {
    return this.db.prepare(`
      SELECT id, main_file AS mainFile, status, pdf_path AS pdfPath, log, duration_ms AS durationMs, created_at AS createdAt
      FROM latex_build ORDER BY created_at DESC LIMIT ?
    `).all(limit) as Array<{
      id: string
      mainFile: string
      status: "success" | "failed" | "unavailable"
      pdfPath: string | null
      log: string
      durationMs: number | null
      createdAt: number
    }>
  }

  close() {
    this.db.close()
  }
}
