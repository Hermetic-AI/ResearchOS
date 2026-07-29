"""SQLite artifact store, shared with the TS DataStore (same DDL, WAL)."""

import sqlite3
import time
import uuid
from pathlib import Path

DDL = """
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
"""


def db_path(root: Path) -> Path:
    return root / ".researchos" / "data-analysis.db"


def artifacts_dir(root: Path) -> Path:
    return root / ".researchos" / "artifacts"


def connect(root: Path) -> sqlite3.Connection:
    artifacts_dir(root).mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path(root), timeout=5.0)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(DDL)
    return conn


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4()}"


def upsert_dataset(
    conn: sqlite3.Connection, *, path: str, name: str, fmt: str, size_bytes: int, profile_json: str | None
) -> str:
    row = conn.execute("SELECT id FROM datasets WHERE path = ?", (path,)).fetchone()
    if row:
        if profile_json:
            conn.execute("UPDATE datasets SET profile_json = ? WHERE id = ?", (profile_json, row[0]))
        return row[0]
    dataset_id = new_id("ds")
    conn.execute(
        "INSERT INTO datasets (id, name, path, format, size_bytes, profile_json, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (dataset_id, name, path, fmt, size_bytes, profile_json, now_ms()),
    )
    return dataset_id


def dataset_id_for_path(conn: sqlite3.Connection, path: str) -> str | None:
    row = conn.execute("SELECT id FROM datasets WHERE path = ?", (path,)).fetchone()
    return row[0] if row else None


def insert_artifact(
    conn: sqlite3.Connection,
    *,
    kind: str,
    path: str,
    fmt: str,
    preview_path: str | None = None,
    dpi: int | None = None,
    latex_snippet: str | None = None,
    spec_json: str | None = None,
    cell_id: str | None = None,
) -> str:
    artifact_id = new_id("art")
    conn.execute(
        "INSERT INTO artifacts (id, cell_id, kind, path, preview_path, format, dpi,"
        " latex_snippet, spec_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (artifact_id, cell_id, kind, path, preview_path, fmt, dpi, latex_snippet, spec_json, now_ms()),
    )
    return artifact_id


def insert_stat_test(
    conn: sqlite3.Connection,
    *,
    test: str,
    columns_json: str,
    statistic: float | None,
    p_value: float | None,
    conclusion: str,
    dataset_id: str | None = None,
    cell_id: str | None = None,
) -> str:
    test_id = new_id("st")
    conn.execute(
        "INSERT INTO stat_tests (id, dataset_id, cell_id, test, columns_json, statistic, p_value,"
        " conclusion, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (test_id, dataset_id, cell_id, test, columns_json, statistic, p_value, conclusion, now_ms()),
    )
    return test_id


def artifact_for_path(conn: sqlite3.Connection, path_or_id: str) -> sqlite3.Row | dict | None:
    row = conn.execute(
        "SELECT id, path FROM artifacts WHERE path = ? OR id = ?", (path_or_id, path_or_id)
    ).fetchone()
    return row


def upsert_link(
    conn: sqlite3.Connection,
    *,
    artifact_id: str,
    commit: str | None,
    tex_file: str | None,
    tex_section: str | None,
) -> None:
    conn.execute(
        "INSERT INTO artifact_links (artifact_id, git_commit, tex_file, tex_section, linked_at)"
        " VALUES (?, ?, ?, ?, ?)"
        " ON CONFLICT(artifact_id, tex_file, tex_section)"
        " DO UPDATE SET git_commit = excluded.git_commit, linked_at = excluded.linked_at",
        (artifact_id, commit, tex_file, tex_section, now_ms()),
    )
