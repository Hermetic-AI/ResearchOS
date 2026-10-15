import sqlite3
import time
import uuid
from pathlib import Path

DDL = """
CREATE TABLE IF NOT EXISTS plot_chart (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, template TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'nature', spec_path TEXT NOT NULL, code_path TEXT NOT NULL,
  data_ref TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS plot_artifact (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL, chart_id TEXT,
  path TEXT NOT NULL, preview_svg TEXT, tex_file TEXT, tex_label TEXT, "commit" TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plot_artifact_ws ON plot_artifact(workspace_id, kind);
"""


def connect(root: Path) -> sqlite3.Connection:
    (root / ".researchos").mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(root / ".researchos" / "plots.db", timeout=5)
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA busy_timeout = 5000")
    connection.executescript(DDL)
    return connection


def now_ms() -> int:
    return int(time.time() * 1000)


def insert_chart(
    connection: sqlite3.Connection,
    *,
    chart_id: str,
    workspace: str,
    template: str,
    theme: str,
    spec_path: str,
    code_path: str,
    data_ref: str,
) -> None:
    timestamp = now_ms()
    connection.execute(
        "INSERT INTO plot_chart VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (chart_id, workspace, template, theme, spec_path, code_path, data_ref, timestamp, timestamp),
    )


def update_chart(connection: sqlite3.Connection, chart_id: str, theme: str) -> None:
    connection.execute(
        "UPDATE plot_chart SET theme = ?, updated_at = ? WHERE id = ?",
        (theme, now_ms(), chart_id),
    )


def insert_artifact(
    connection: sqlite3.Connection,
    *,
    workspace: str,
    chart_id: str,
    path: str,
    preview_svg: str,
) -> None:
    connection.execute(
        "INSERT INTO plot_artifact (id, workspace_id, kind, chart_id, path, preview_svg, created_at)"
        " VALUES (?, ?, 'chart', ?, ?, ?, ?)",
        (str(uuid.uuid4()), workspace, chart_id, path, preview_svg, now_ms()),
    )
