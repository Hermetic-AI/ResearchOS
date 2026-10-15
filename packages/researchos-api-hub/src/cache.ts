import { Database } from "bun:sqlite"

export interface CacheStats {
  hits: number
  misses: number
}

export class ResponseCache {
  private db: Database
  private stats = new Map<string, CacheStats>()

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath, { create: true })
    if (dbPath !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA busy_timeout = 5000")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_cache (
        cache_key TEXT PRIMARY KEY,
        adapter_name TEXT NOT NULL,
        value_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS api_cache_adapter_idx ON api_cache(adapter_name);
      CREATE INDEX IF NOT EXISTS api_cache_expiry_idx ON api_cache(expires_at);
    `)
  }

  get(adapterName: string, key: string): { value: unknown } | null {
    const cacheKey = this.cacheKey(adapterName, key)
    const row = this.db.prepare("SELECT value_json, expires_at FROM api_cache WHERE cache_key = ?").get(cacheKey) as
      | { value_json: string; expires_at: number }
      | undefined
    if (!row) {
      this.recordMiss(adapterName)
      return null
    }
    if (Date.now() >= row.expires_at) {
      this.db.prepare("DELETE FROM api_cache WHERE cache_key = ?").run(cacheKey)
      this.recordMiss(adapterName)
      return null
    }
    this.recordHit(adapterName)
    return { value: JSON.parse(row.value_json) }
  }

  set(adapterName: string, key: string, value: unknown, ttlS: number): void {
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO api_cache (cache_key, adapter_name, value_json, expires_at, created_at)
      VALUES ($cacheKey, $adapterName, $valueJson, $expiresAt, $createdAt)
      ON CONFLICT(cache_key) DO UPDATE SET
        value_json = excluded.value_json,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at
    `).run({
      $cacheKey: this.cacheKey(adapterName, key),
      $adapterName: adapterName,
      $valueJson: JSON.stringify(value),
      $expiresAt: now + ttlS * 1000,
      $createdAt: now,
    })
  }

  clear(adapterName?: string): void {
    if (!adapterName) {
      this.db.run("DELETE FROM api_cache")
      return
    }
    this.db.prepare("DELETE FROM api_cache WHERE adapter_name = ?").run(adapterName)
  }

  hitRate(adapterName: string): number {
    const stats = this.stats.get(adapterName)
    if (!stats) return 0
    const total = stats.hits + stats.misses
    return total === 0 ? 0 : stats.hits / total
  }

  close(): void {
    this.db.close()
  }

  private cacheKey(adapterName: string, key: string): string {
    return `${adapterName}:${new Bun.CryptoHasher("sha256").update(key).digest("hex")}`
  }

  private recordHit(name: string): void {
    const stats = this.stats.get(name) ?? { hits: 0, misses: 0 }
    stats.hits++
    this.stats.set(name, stats)
  }

  private recordMiss(name: string): void {
    const stats = this.stats.get(name) ?? { hits: 0, misses: 0 }
    stats.misses++
    this.stats.set(name, stats)
  }
}
