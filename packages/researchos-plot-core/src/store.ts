import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { extname, resolve, sep } from "path"

const DDL = `
CREATE TABLE IF NOT EXISTS plot_chart (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  template TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'nature',
  spec_path TEXT NOT NULL,
  code_path TEXT NOT NULL,
  data_ref TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plot_artifact (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  chart_id TEXT,
  path TEXT NOT NULL,
  preview_svg TEXT,
  tex_file TEXT,
  tex_label TEXT,
  "commit" TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plot_artifact_ws ON plot_artifact(workspace_id, kind);
`

export interface PlotArtifact {
  id: string
  kind: string
  chartId: string | null
  path: string
  previewSvg: string | null
  texFile: string | null
  texLabel: string | null
  createdAt: number
}

export class PlotStore {
  private db: Database

  constructor(private root: string) {
    mkdirSync(resolve(root, ".researchos"), { recursive: true })
    this.db = new Database(resolve(root, ".researchos", "plots.db"), { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA busy_timeout = 5000")
    this.db.exec(DDL)
  }

  registerArtifact(input: { kind: string; path: string; previewSvg?: string; chartId?: string }): PlotArtifact {
    const id = crypto.randomUUID()
    this.db.prepare(
      "INSERT INTO plot_artifact (id, workspace_id, kind, chart_id, path, preview_svg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, this.root, input.kind, input.chartId ?? null, input.path, input.previewSvg ?? null, Date.now())
    return this.getArtifact(id)!
  }

  listArtifacts(): PlotArtifact[] {
    return (this.db.prepare("SELECT * FROM plot_artifact ORDER BY created_at DESC").all() as Array<Record<string, unknown>>)
      .map(mapArtifact)
  }

  getArtifact(id: string): PlotArtifact | null {
    const row = this.db.prepare("SELECT * FROM plot_artifact WHERE id = ?").get(id) as Record<string, unknown> | undefined
    return row ? mapArtifact(row) : null
  }

  markReferenced(path: string, texFile: string, label: string): void {
    this.db.prepare("UPDATE plot_artifact SET tex_file = ?, tex_label = ? WHERE path = ?").run(texFile, label, path)
  }

  readArtifact(id: string): { format: string; content: Uint8Array } {
    const artifact = this.getArtifact(id)
    if (!artifact) throw new Error(`unknown plot artifact: ${id}`)
    const path = resolveInside(this.root, artifact.path)
    if (!existsSync(path)) throw new Error(`plot artifact file missing: ${artifact.path}`)
    return { format: extname(path).slice(1).toLowerCase() || "bin", content: readFileSync(path) }
  }

  close(): void {
    this.db.close()
  }
}

export function resolveInside(root: string, path: string) {
  const resolved = resolve(root, path)
  if (resolved !== resolve(root) && !resolved.startsWith(resolve(root) + sep)) {
    throw new Error(`Path escapes project root: ${path}`)
  }
  return resolved
}

function mapArtifact(row: Record<string, unknown>): PlotArtifact {
  return {
    id: row.id as string,
    kind: row.kind as string,
    chartId: row.chart_id as string | null,
    path: row.path as string,
    previewSvg: row.preview_svg as string | null,
    texFile: row.tex_file as string | null,
    texLabel: row.tex_label as string | null,
    createdAt: row.created_at as number,
  }
}
