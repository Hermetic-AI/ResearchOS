import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { resolve } from "path"

export type RunRow = { id: string; paperUrl: string; repoUrl: string; status: string; currentStep: number; envStrategy: string; error?: string; createdAt: number; updatedAt: number }
export type StepRow = { id: string; runId: string; seq: number; name: string; status: string; log: string; outputJson?: string; startedAt?: number; finishedAt?: number }
export type MetricRow = { id: string; runId: string; model: string; dataset: string; metric: string; paperValue?: number; reproValue?: number; tolerance: number; verdict: string; source: string }
export type IssueRow = { id: string; runId: string; category: string; severity: string; title: string; detail: string; evidence?: string; createdAt: number }

export class ReproduceStore {
  private database: Database
  constructor(readonly root: string) {
    mkdirSync(resolve(root, ".researchos", "reproduce"), { recursive: true })
    this.database = new Database(resolve(root, ".researchos", "reproduce", "reproduce.db"), { create: true })
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS reproduce_run (id TEXT PRIMARY KEY, paper_url TEXT NOT NULL, repo_url TEXT NOT NULL, status TEXT NOT NULL, current_step INTEGER NOT NULL, env_strategy TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS reproduce_step (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES reproduce_run(id), seq INTEGER NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, log TEXT NOT NULL DEFAULT '', output_json TEXT, started_at INTEGER, finished_at INTEGER, UNIQUE(run_id, seq)); CREATE TABLE IF NOT EXISTS reproduce_metric (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES reproduce_run(id), model TEXT NOT NULL, dataset TEXT NOT NULL, metric TEXT NOT NULL, paper_value REAL, repro_value REAL, tolerance REAL NOT NULL, verdict TEXT NOT NULL, source TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reproduce_issue (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES reproduce_run(id), category TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, evidence TEXT, created_at INTEGER NOT NULL);")
  }
  create(paperUrl: string, repoUrl: string, envStrategy: string) {
    const id = `run_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    const now = Date.now()
    this.database.transaction(() => {
      this.database.run("INSERT INTO reproduce_run VALUES (?, ?, ?, 'pending', 0, ?, NULL, ?, ?)", [id, paperUrl, repoUrl, envStrategy, now, now])
      ;["clone", "analyze", "env_detect", "env_generate", "run", "compare"].forEach((name, index) => this.database.run("INSERT INTO reproduce_step (id, run_id, seq, name, status) VALUES (?, ?, ?, ?, 'pending')", [`${id}_${index + 1}`, id, index + 1, name]))
    })()
    return id
  }
  list() { return this.database.query("SELECT * FROM reproduce_run ORDER BY created_at DESC").all().map(wireRun) }
  run(id: string) { const row = this.database.query("SELECT * FROM reproduce_run WHERE id=?").get(id); if (!row) throw new Error(`unknown run: ${id}`); return wireRun(row) }
  steps(id: string) { return this.database.query("SELECT * FROM reproduce_step WHERE run_id=? ORDER BY seq").all(id).map(wireStep) }
  step(id: string, name: string) { const row = this.database.query("SELECT * FROM reproduce_step WHERE run_id=? AND name=?").get(id, name); if (!row) throw new Error(`unknown step: ${name}`); return wireStep(row) }
  startStep(id: string, name: string) { const step = this.step(id, name); this.database.run("UPDATE reproduce_step SET status='running', started_at=?, log='' WHERE id=?", [Date.now(), step.id]); this.database.run("UPDATE reproduce_run SET status='running', current_step=?, error=NULL, updated_at=? WHERE id=?", [step.seq, Date.now(), id]) }
  finishStep(id: string, name: string, log: string, output: unknown) { const step = this.step(id, name); this.database.run("UPDATE reproduce_step SET status='completed', log=?, output_json=?, finished_at=? WHERE id=?", [log, JSON.stringify(output), Date.now(), step.id]); this.database.run("UPDATE reproduce_run SET status=?, updated_at=? WHERE id=?", [step.seq === 6 ? "completed" : "running", Date.now(), id]) }
  failStep(id: string, name: string, log: string, error: string) { const step = this.step(id, name); this.database.run("UPDATE reproduce_step SET status='failed', log=?, finished_at=? WHERE id=?", [log, Date.now(), step.id]); this.database.run("UPDATE reproduce_run SET status='failed', error=?, updated_at=? WHERE id=?", [error, Date.now(), id]) }
  addMetric(value: Omit<MetricRow, "id">) { this.database.run("INSERT INTO reproduce_metric VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), value.runId, value.model, value.dataset, value.metric, value.paperValue ?? null, value.reproValue ?? null, value.tolerance, value.verdict, value.source]) }
  metrics(id: string) { return this.database.query("SELECT * FROM reproduce_metric WHERE run_id=?").all(id).map(wireMetric) }
  addIssue(value: Omit<IssueRow, "id" | "createdAt">) { this.database.run("INSERT INTO reproduce_issue VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), value.runId, value.category, value.severity, value.title, value.detail, value.evidence ?? null, Date.now()]) }
  issues(id: string) { return this.database.query("SELECT * FROM reproduce_issue WHERE run_id=? ORDER BY created_at").all(id).map(wireIssue) }
  cancel(id: string) { this.database.run("UPDATE reproduce_run SET status='cancelled', updated_at=? WHERE id=?", [Date.now(), id]) }
  close() { this.database.close() }
}
type Row = Record<string, string | number | null>
function wireRun(input: unknown): RunRow { const value = input as Row; return { id: String(value.id), paperUrl: String(value.paper_url), repoUrl: String(value.repo_url), status: String(value.status), currentStep: Number(value.current_step), envStrategy: String(value.env_strategy), ...(value.error ? { error: String(value.error) } : {}), createdAt: Number(value.created_at), updatedAt: Number(value.updated_at) } }
function wireStep(input: unknown): StepRow { const value = input as Row; return { id: String(value.id), runId: String(value.run_id), seq: Number(value.seq), name: String(value.name), status: String(value.status), log: String(value.log), ...(value.output_json ? { outputJson: String(value.output_json) } : {}), ...(value.started_at ? { startedAt: Number(value.started_at) } : {}), ...(value.finished_at ? { finishedAt: Number(value.finished_at) } : {}) } }
function wireMetric(input: unknown): MetricRow { const value = input as Row; return { id: String(value.id), runId: String(value.run_id), model: String(value.model), dataset: String(value.dataset), metric: String(value.metric), ...(value.paper_value === null ? {} : { paperValue: Number(value.paper_value) }), ...(value.repro_value === null ? {} : { reproValue: Number(value.repro_value) }), tolerance: Number(value.tolerance), verdict: String(value.verdict), source: String(value.source) } }
function wireIssue(input: unknown): IssueRow { const value = input as Row; return { id: String(value.id), runId: String(value.run_id), category: String(value.category), severity: String(value.severity), title: String(value.title), detail: String(value.detail), ...(value.evidence ? { evidence: String(value.evidence) } : {}), createdAt: Number(value.created_at) } }
