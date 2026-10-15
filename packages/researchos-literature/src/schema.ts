export const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS paper (
  id            TEXT PRIMARY KEY,
  doi           TEXT UNIQUE,
  arxiv_id      TEXT,
  title         TEXT NOT NULL,
  year          INTEGER,
  venue         TEXT,
  abstract      TEXT,
  keywords      TEXT,
  citation_count INTEGER DEFAULT 0,
  pdf_path      TEXT,
  source        TEXT,
  is_read       INTEGER DEFAULT 0,
  is_favorite   INTEGER DEFAULT 0,
  notes_md      TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS author (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  affiliation TEXT
);

CREATE TABLE IF NOT EXISTS paper_author (
  paper_id  TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES author(id),
  position  INTEGER NOT NULL,
  PRIMARY KEY (paper_id, author_id)
);

CREATE TABLE IF NOT EXISTS tag (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_tag (
  paper_id TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tag(id),
  PRIMARY KEY (paper_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collection (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL DEFAULT 'manual',
  query TEXT
);

CREATE TABLE IF NOT EXISTS paper_collection (
  paper_id      TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  collection_id INTEGER NOT NULL REFERENCES collection(id),
  PRIMARY KEY (paper_id, collection_id)
);

CREATE TABLE IF NOT EXISTS citation_edge (
  from_id TEXT NOT NULL,
  to_id   TEXT NOT NULL,
  context TEXT,
  source  TEXT NOT NULL DEFAULT 'pdf',
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS external_paper (
  id    TEXT PRIMARY KEY,
  title TEXT,
  year  INTEGER,
  doi   TEXT
);

CREATE TABLE IF NOT EXISTS paper_chunk (
  chunk_id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES paper(id) ON DELETE CASCADE,
  section  TEXT,
  seq      INTEGER NOT NULL,
  text     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paper_year ON paper(year);
CREATE INDEX IF NOT EXISTS idx_paper_venue ON paper(venue);
CREATE INDEX IF NOT EXISTS idx_edge_to ON citation_edge(to_id);
CREATE INDEX IF NOT EXISTS idx_chunk_paper ON paper_chunk(paper_id);

CREATE VIRTUAL TABLE IF NOT EXISTS paper_embedding USING vec0(
  paper_id TEXT PRIMARY KEY,
  embedding float[384]
);

CREATE VIRTUAL TABLE IF NOT EXISTS paper_chunk_embedding USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding float[384]
);
`
