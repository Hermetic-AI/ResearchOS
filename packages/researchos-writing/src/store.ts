import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { dirname, join } from "path"

// 设计 §5.2 原定写入 P1 的 researchos.db；实际 P1 落的是 .researchos/literature/literature.db，
// 为避免跨包写耦合，写作记录落独立的 .researchos/writing/writing.db
const DDL = `
CREATE TABLE IF NOT EXISTS writing_suggestion (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  target_file   TEXT,
  input_digest  TEXT NOT NULL,
  input_excerpt TEXT NOT NULL,
  output        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    INTEGER NOT NULL,
  reviewed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_writing_suggestion_kind ON writing_suggestion(kind, created_at);

CREATE TABLE IF NOT EXISTS writing_rewrite_hunk (
  id            TEXT PRIMARY KEY,
  suggestion_id TEXT NOT NULL REFERENCES writing_suggestion(id),
  hunk_index    INTEGER NOT NULL,
  original      TEXT NOT NULL,
  revised       TEXT NOT NULL,
  accepted      INTEGER NOT NULL,
  style         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rewrite_hunk_suggestion ON writing_rewrite_hunk(suggestion_id);

CREATE TABLE IF NOT EXISTS writing_citation (
  id            TEXT PRIMARY KEY,
  tex_file      TEXT NOT NULL,
  cite_key      TEXT NOT NULL,
  paper_id      TEXT NOT NULL,
  context_hash  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (tex_file, cite_key)
);
`

export interface SuggestionInput {
  kind: "title" | "structure" | "rewrite" | "algorithm" | "table" | "md" | "cite"
  targetFile?: string
  inputExcerpt: string
  output: string
  status: "pending" | "accepted" | "rejected" | "partial"
}

export interface HunkRecord {
  hunkIndex: number
  original: string
  revised: string
  accepted: boolean
  style: "academic" | "concise" | "passive"
}

export class WritingStore {
  private db: Database

  constructor(projectRoot: string) {
    const path = join(projectRoot, ".researchos", "writing", "writing.db")
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path, { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA foreign_keys = ON")
    DDL.split(";").map((stmt) => stmt.trim()).filter(Boolean).forEach((stmt) => this.db.run(stmt + ";"))
  }

  recordSuggestion(input: SuggestionInput): { id: string } {
    const id = crypto.randomUUID()
    this.db.prepare(`
      INSERT INTO writing_suggestion (id, kind, target_file, input_digest, input_excerpt, output, status, created_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.kind,
      input.targetFile ?? null,
      new Bun.CryptoHasher("sha256").update(input.inputExcerpt).digest("hex"),
      input.inputExcerpt.slice(0, 500),
      input.output,
      input.status,
      Date.now(),
      input.status === "pending" ? null : Date.now(),
    )
    return { id }
  }

  recordHunks(suggestionId: string, hunks: HunkRecord[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO writing_rewrite_hunk (id, suggestion_id, hunk_index, original, revised, accepted, style)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    this.db.transaction((rows: HunkRecord[]) => {
      rows.forEach((hunk) =>
        stmt.run(crypto.randomUUID(), suggestionId, hunk.hunkIndex, hunk.original, hunk.revised, hunk.accepted ? 1 : 0, hunk.style),
      )
    })(hunks)
  }

  recordCitation(input: { texFile: string; citeKey: string; paperId: string; contextHash: string }): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO writing_citation (id, tex_file, cite_key, paper_id, context_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), input.texFile, input.citeKey, input.paperId, input.contextHash, Date.now())
  }

  listSuggestions(kind?: SuggestionInput["kind"], limit = 50): Array<Record<string, unknown>> {
    return (kind
      ? this.db.prepare("SELECT * FROM writing_suggestion WHERE kind = ? ORDER BY created_at DESC LIMIT ?").all(kind, limit)
      : this.db.prepare("SELECT * FROM writing_suggestion ORDER BY created_at DESC LIMIT ?").all(limit)) as Array<Record<string, unknown>>
  }

  close(): void {
    this.db.close()
  }
}
