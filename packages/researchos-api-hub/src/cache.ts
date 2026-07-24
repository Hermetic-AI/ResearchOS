export interface CacheStats {
  hits: number
  misses: number
}

export class ResponseCache {
  private stats: Map<string, CacheStats> = new Map()

  constructor(private dbPath?: string) {}

  private hash(key: string): string {
    let h = 0
    for (let i = 0; i < key.length; i++) {
      h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
    }
    return Math.abs(h).toString(36)
  }

  private cacheKey(adapterName: string, params: string): string {
    return `${adapterName}:${this.hash(params)}`
  }

  get(adapterName: string, params: string): { value: unknown } | null {
    const key = this.cacheKey(adapterName, params)
    const entry = this.memory.get(key)
    if (!entry) {
      this.recordMiss(adapterName)
      return null
    }
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key)
      this.recordMiss(adapterName)
      return null
    }
    this.recordHit(adapterName)
    return { value: entry.value }
  }

  set(adapterName: string, params: string, value: unknown, ttlS: number): void {
    const key = this.cacheKey(adapterName, params)
    this.memory.set(key, { value, expiresAt: Date.now() + ttlS * 1000 })
  }

  hitRate(adapterName: string): number {
    const s = this.stats.get(adapterName)
    if (!s) return 0
    const total = s.hits + s.misses
    return total === 0 ? 0 : s.hits / total
  }

  private memory = new Map<string, { value: unknown; expiresAt: number }>()

  private recordHit(name: string): void {
    const s = this.stats.get(name) ?? { hits: 0, misses: 0 }
    s.hits++
    this.stats.set(name, s)
  }

  private recordMiss(name: string): void {
    const s = this.stats.get(name) ?? { hits: 0, misses: 0 }
    s.misses++
    this.stats.set(name, s)
  }
}
