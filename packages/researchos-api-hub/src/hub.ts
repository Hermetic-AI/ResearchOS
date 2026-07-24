import type { ApiAdapter, ApiDescriptor, ApiHub, ApiStatus } from "./registry"
import { RateLimiter } from "./rate-limiter"
import { ResponseCache } from "./cache"
import { withRetry } from "./retry"
import { StatsCollector } from "./stats"

export class HubImpl implements ApiHub {
  private limiters = new Map<string, RateLimiter>()
  private cache = new ResponseCache()
  private stats = new StatsCollector()
  private adapters = new Map<string, ApiDescriptor>()

  register(adapter: ApiAdapter<unknown, unknown>): void {
    const d = adapter.descriptor
    this.adapters.set(d.name, d)
    this.limiters.set(d.name, new RateLimiter(d.rateLimit.rps))
  }

  async call<TReq, TRes>(adapter: ApiAdapter<TReq, TRes>, req: TReq): Promise<TRes> {
    const name = adapter.descriptor.name
    this.stats.recordCall(name)

    const params = JSON.stringify(req)
    const cached = this.cache.get(name, params)
    if (cached) return cached.value as TRes

    const limiter = this.limiters.get(name)!
    await limiter.acquire()

    try {
      const result = await withRetry(async () => {
        const { path, params: queryParams } = adapter.buildRequest(req)
        const url = new URL(path, adapter.descriptor.baseUrl)
        if (queryParams) {
          for (const [k, v] of Object.entries(queryParams)) {
            url.searchParams.set(k, v)
          }
        }

        const response = await fetch(url.toString(), {
          headers: adapter.headers ? adapter.headers(req) : {},
          signal: AbortSignal.timeout(15000),
        })

        if (!response.ok) {
          if (response.status === 429) {
            throw new Error(`${name}: rate limited (429)`)
          }
          throw new Error(`${name}: HTTP ${response.status}`)
        }

        const json = await response.json()
        return adapter.schema.parse(json) as TRes
      })

      const ttl = adapter.descriptor.cacheTtlS
      if (ttl > 0) {
        this.cache.set(name, params, result, ttl)
      }
      this.stats.recordSuccess(name)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.stats.recordError(name, message)
      throw err
    }
  }

  status(name: string): ApiStatus {
    const d = this.adapters.get(name)
    const limiter = this.limiters.get(name)
    const lastError = this.stats.getLastError(name)
    const lastCall = this.stats.getLastCallAt(name)
    const lastSuccess = this.stats.getLastSuccessAt(name)
    return {
      name,
      healthy: lastError === undefined || lastSuccess > (lastError ? this.stats.getLastCallAt(name) : 0),
      lastError,
      lastCallAt: lastCall,
      callsTotal: this.stats.getCallsTotal(name),
      cacheHitRate: this.cache.hitRate(name),
      rpmCurrent: limiter?.availableTokens ?? 0,
    }
  }

  list(): ApiDescriptor[] {
    return Array.from(this.adapters.values())
  }

  async test(name: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const d = this.adapters.get(name)
    if (!d) return { ok: false, latencyMs: 0, error: `Unknown adapter: ${name}` }
    const start = Date.now()
    try {
      const response = await fetch(d.baseUrl, { signal: AbortSignal.timeout(10000) })
      return { ok: response.ok, latencyMs: Date.now() - start }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - start, error: String(err) }
    }
  }
}
