import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { resolve, sep } from "path"
import { artifactsDir, dbPath } from "./paths"

// DDL 与 Python 侧 db.py 保持一致（同一文件，WAL 共享读写，设计 §5.2）
const DDL = `
CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  format TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  profile_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cells (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER,
  executed_at INTEGER,
  kernel_snapshot TEXT
);
CREATE INDEX IF NOT EXISTS idx_cells_notebook ON cells(notebook_id, position);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  cell_id TEXT REFERENCES cells(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  preview_path TEXT,
  format TEXT NOT NULL,
  dpi INTEGER,
  latex_snippet TEXT,
  spec_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifact_links (
  artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  git_commit TEXT,
  tex_file TEXT,
  tex_section TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, tex_file, tex_section)
);

CREATE TABLE IF NOT EXISTS stat_tests (
  id TEXT PRIMARY KEY,
  dataset_id TEXT REFERENCES datasets(id) ON DELETE SET NULL,
  cell_id TEXT REFERENCES cells(id) ON DELETE SET NULL,
  test TEXT NOT NULL,
  columns_json TEXT NOT NULL,
  statistic REAL,
  p_value REAL,
  conclusion TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export interface DatasetRow {
  id: string
  name: string
  path: string
  format: string
  sizeBytes: number
  profileJson: string | null
  createdAt: number
}

export interface ArtifactRow {
  id: string
  cellId: string | null
  kind: string
  path: string
  previewPath: string | null
  format: string
  dpi: number | null
  latexSnippet: string | null
  specJson: string | null
  createdAt: number
}

export interface ArtifactLinkRow {
  artifactId: string
  gitCommit: string | null
  texFile: string | null
  texSection: string | null
  linkedAt: number
}

export interface StatTestRow {
  id: string
  datasetId: string | null
  cellId: string | null
  test: string
  columnsJson: string
  statistic: number | null
  pValue: number | null
  conclusion: string
  createdAt: number
}

export interface NotebookRow {
  id: string
  title: string
  createdAt: number
}

export interface CellRow {
  id: string
  notebookId: string
  position: number
  source: string
  status: "idle" | "running" | "success" | "error"
  stdout: string | null
  stderr: string | null
  durationMs: number | null
  executedAt: number | null
}

export class DataStore {
  private db: Database

  constructor(private projectRoot: string) {
    mkdirSync(artifactsDir(projectRoot), { recursive: true })
    this.db = new Database(dbPath(projectRoot), { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA busy_timeout = 5000")
    this.db.exec("PRAGMA foreign_keys = ON")
    this.db.exec("PRAGMA user_version = 1")
    DDL.split(";").map((stmt) => stmt.trim()).filter(Boolean).forEach((stmt) => this.db.run(stmt + ";"))
  }

  registerDataset(input: { name: string; path: string; format: string; sizeBytes: number; profileJson?: string }): DatasetRow {
    const existing = this.db.prepare("SELECT id FROM datasets WHERE path = ?").get(input.path) as { id: string } | undefined
    if (existing) {
      if (input.profileJson) this.db.prepare("UPDATE datasets SET profile_json = ? WHERE id = ?").run(input.profileJson, existing.id)
      return this.getDataset(existing.id)!
    }
    const id = `ds_${crypto.randomUUID()}`
    this.db.prepare("INSERT INTO datasets (id, name, path, format, size_bytes, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.name, input.path, input.format, input.sizeBytes, input.profileJson ?? null, Date.now())
    return this.getDataset(id)!
  }

  getDataset(id: string): DatasetRow | null {
    const row = this.db.prepare("SELECT * FROM datasets WHERE id = ?").get(id) as Record<string, unknown> | undefined
    return row ? mapDataset(row) : null
  }

  listDatasets(): DatasetRow[] {
    return (this.db.prepare("SELECT * FROM datasets ORDER BY created_at DESC").all() as Array<Record<string, unknown>>).map(mapDataset)
  }

  createNotebook(title: string): NotebookRow {
    const id = `nb_${crypto.randomUUID()}`
    this.db.prepare("INSERT INTO notebooks (id, title, created_at) VALUES (?, ?, ?)").run(id, title, Date.now())
    return this.getNotebook(id)!
  }

  getNotebook(id: string): NotebookRow | null {
    const row = this.db.prepare("SELECT * FROM notebooks WHERE id = ?").get(id) as Record<string, unknown> | undefined
    return row ? mapNotebook(row) : null
  }

  listNotebooks(): NotebookRow[] {
    return (this.db.prepare("SELECT * FROM notebooks ORDER BY created_at DESC").all() as Array<Record<string, unknown>>).map(mapNotebook)
  }

  ensureNotebook(): NotebookRow {
    return this.listNotebooks()[0] ?? this.createNotebook("Analysis")
  }

  createCell(input: { notebookId: string; source?: string }): CellRow {
    if (!this.getNotebook(input.notebookId)) throw new Error(`Unknown notebook: ${input.notebookId}`)
    const position = (this.db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM cells WHERE notebook_id = ?").get(input.notebookId) as { position: number }).position
    const id = `cell_${crypto.randomUUID()}`
    this.db.prepare("INSERT INTO cells (id, notebook_id, position, source, status) VALUES (?, ?, ?, ?, 'idle')")
      .run(id, input.notebookId, position, input.source ?? "")
    return this.getCell(id)!
  }

  getCell(id: string): CellRow | null {
    const row = this.db.prepare("SELECT * FROM cells WHERE id = ?").get(id) as Record<string, unknown> | undefined
    return row ? mapCell(row) : null
  }

  listCells(notebookId: string): CellRow[] {
    return (this.db.prepare("SELECT * FROM cells WHERE notebook_id = ? ORDER BY position").all(notebookId) as Array<Record<string, unknown>>).map(mapCell)
  }

  updateCellSource(id: string, source: string): CellRow {
    if (!this.getCell(id)) throw new Error(`Unknown cell: ${id}`)
    this.db.prepare("UPDATE cells SET source = ? WHERE id = ?").run(source, id)
    return this.getCell(id)!
  }

  recordCellRun(id: string, input: { status: "success" | "error"; stdout: string; stderr: string; durationMs: number }): CellRow {
    if (!this.getCell(id)) throw new Error(`Unknown cell: ${id}`)
    this.db.prepare("UPDATE cells SET status = ?, stdout = ?, stderr = ?, duration_ms = ?, executed_at = ? WHERE id = ?")
      .run(input.status, input.stdout, input.stderr, input.durationMs, Date.now(), id)
    return this.getCell(id)!
  }

  registerArtifact(input: {
    cellId?: string
    kind: string
    path: string
    previewPath?: string
    format: string
    dpi?: number
    latexSnippet?: string
    specJson?: string
  }): ArtifactRow {
    const id = `art_${crypto.randomUUID()}`
    this.db.prepare(`
      INSERT INTO artifacts (id, cell_id, kind, path, preview_path, format, dpi, latex_snippet, spec_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.cellId ?? null, input.kind, input.path, input.previewPath ?? null,
      input.format, input.dpi ?? null, input.latexSnippet ?? null, input.specJson ?? null, Date.now(),
    )
    return this.getArtifact(id)!
  }

  getArtifact(id: string): ArtifactRow | null {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as Record<string, unknown> | undefined
    return row ? mapArtifact(row) : null
  }

  getArtifactByPath(path: string): ArtifactRow | null {
    const row = this.db.prepare("SELECT * FROM artifacts WHERE path = ?").get(path) as Record<string, unknown> | undefined
    return row ? mapArtifact(row) : null
  }

  listArtifacts(): ArtifactRow[] {
    return (this.db.prepare("SELECT * FROM artifacts ORDER BY created_at DESC").all() as Array<Record<string, unknown>>).map(mapArtifact)
  }

  listLinks(artifactId: string): ArtifactLinkRow[] {
    return (this.db.prepare("SELECT * FROM artifact_links WHERE artifact_id = ? ORDER BY linked_at DESC").all(artifactId) as Array<Record<string, unknown>>)
      .map((row) => ({
        artifactId: row.artifact_id as string,
        gitCommit: row.git_commit as string | null,
        texFile: row.tex_file as string | null,
        texSection: row.tex_section as string | null,
        linkedAt: row.linked_at as number,
      }))
  }

  recordStatTest(input: {
    datasetId?: string
    cellId?: string
    test: string
    columnsJson: string
    statistic?: number
    pValue?: number
    conclusion: string
  }): StatTestRow {
    const id = `st_${crypto.randomUUID()}`
    this.db.prepare(`
      INSERT INTO stat_tests (id, dataset_id, cell_id, test, columns_json, statistic, p_value, conclusion, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.datasetId ?? null, input.cellId ?? null, input.test, input.columnsJson,
      input.statistic ?? null, input.pValue ?? null, input.conclusion, Date.now(),
    )
    const row = this.db.prepare("SELECT * FROM stat_tests WHERE id = ?").get(id) as Record<string, unknown>
    return mapStatTest(row)
  }

  listStatTests(): StatTestRow[] {
    return (this.db.prepare("SELECT * FROM stat_tests ORDER BY created_at DESC").all() as Array<Record<string, unknown>>).map(mapStatTest)
  }

  // 产物 ↔ commit ↔ tex 章节三元关联（设计 §6.3 link_experiment）
  linkArtifact(input: { artifactId: string; commit?: string; texFile?: string; texSection?: string }): { ok: true; warning?: string } {
    if (!this.getArtifact(input.artifactId)) throw new Error(`Unknown artifact: ${input.artifactId}`)
    const commit = input.commit ?? gitHead(this.projectRoot)
    const warning = input.texFile && input.texSection ? this.checkTexSection(input.texFile, input.texSection) : undefined
    this.db.prepare(`
      INSERT INTO artifact_links (artifact_id, git_commit, tex_file, tex_section, linked_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(artifact_id, tex_file, tex_section) DO UPDATE SET git_commit = excluded.git_commit, linked_at = excluded.linked_at
    `).run(input.artifactId, commit ?? null, input.texFile ?? null, input.texSection ?? null, Date.now())
    return { ok: true, ...(warning ? { warning } : {}) }
  }

  private checkTexSection(texFile: string, texSection: string): string | undefined {
    // 安全白名单：tex 文件必须位于项目根内
    const root = resolve(this.projectRoot)
    const resolved = resolve(root, texFile)
    if (!resolved.startsWith(root + sep)) return `tex_file escapes project root: ${texFile}`
    if (!existsSync(resolved)) return `tex_file not found: ${texFile}`
    const content = readFileSync(resolved, "utf8")
    const hit = content.includes(`\\section{${texSection}}`) || content.includes(`\\label{${texSection}}`)
    return hit ? undefined : `section '${texSection}' not found in ${texFile}; link recorded anyway`
  }

  readArtifactFile(id: string): { format: string; content: Uint8Array } {
    const artifact = this.getArtifact(id)
    if (!artifact) throw new Error(`Unknown artifact: ${id}`)
    const root = resolve(artifactsDir(this.projectRoot))
    const resolved = resolve(root, artifact.path)
    if (!resolved.startsWith(root + sep)) throw new Error(`artifact path escapes artifacts dir: ${artifact.path}`)
    if (!existsSync(resolved)) throw new Error(`artifact file missing: ${artifact.path}`)
    return { format: artifact.format, content: readFileSync(resolved) }
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value)
  }

  close(): void {
    this.db.close()
  }
}

function gitHead(projectRoot: string): string | null {
  const result = Bun.spawnSync({
    cmd: ["git", "rev-parse", "HEAD"],
    cwd: projectRoot,
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0) return null
  return result.stdout.toString().trim() || null
}

function mapDataset(row: Record<string, unknown>): DatasetRow {
  return {
    id: row.id as string,
    name: row.name as string,
    path: row.path as string,
    format: row.format as string,
    sizeBytes: row.size_bytes as number,
    profileJson: row.profile_json as string | null,
    createdAt: row.created_at as number,
  }
}

function mapArtifact(row: Record<string, unknown>): ArtifactRow {
  return {
    id: row.id as string,
    cellId: row.cell_id as string | null,
    kind: row.kind as string,
    path: row.path as string,
    previewPath: row.preview_path as string | null,
    format: row.format as string,
    dpi: row.dpi as number | null,
    latexSnippet: row.latex_snippet as string | null,
    specJson: row.spec_json as string | null,
    createdAt: row.created_at as number,
  }
}

function mapStatTest(row: Record<string, unknown>): StatTestRow {
  return {
    id: row.id as string,
    datasetId: row.dataset_id as string | null,
    cellId: row.cell_id as string | null,
    test: row.test as string,
    columnsJson: row.columns_json as string,
    statistic: row.statistic as number | null,
    pValue: row.p_value as number | null,
    conclusion: row.conclusion as string,
    createdAt: row.created_at as number,
  }
}

function mapNotebook(row: Record<string, unknown>): NotebookRow {
  return { id: row.id as string, title: row.title as string, createdAt: row.created_at as number }
}

function mapCell(row: Record<string, unknown>): CellRow {
  return {
    id: row.id as string,
    notebookId: row.notebook_id as string,
    position: row.position as number,
    source: row.source as string,
    status: row.status as CellRow["status"],
    stdout: row.stdout as string | null,
    stderr: row.stderr as string | null,
    durationMs: row.duration_ms as number | null,
    executedAt: row.executed_at as number | null,
  }
}
