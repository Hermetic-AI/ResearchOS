export const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS graph_node (
  id     TEXT PRIMARY KEY,
  type   TEXT NOT NULL,
  label  TEXT NOT NULL,
  ref_id TEXT,
  x      REAL DEFAULT 0,
  y      REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS graph_edge (
  from_node TEXT NOT NULL,
  to_node   TEXT NOT NULL,
  relation  TEXT NOT NULL,
  PRIMARY KEY (from_node, to_node, relation)
);

CREATE VIRTUAL TABLE IF NOT EXISTS graph_node_fts USING fts5(
  id,
  label,
  content='graph_node',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE IF NOT EXISTS node_embedding USING vec0(
  node_id   TEXT PRIMARY KEY,
  embedding float[384]
);
`
