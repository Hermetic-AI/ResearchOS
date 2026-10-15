import { mkdirSync } from "fs"
import type { ApiAdapter, ApiCredential, ApiDescriptor, ApiHub, ApiStatus } from "./registry"
import { RateLimiter } from "./rate-limiter"
import { ResponseCache } from "./cache"
import { withRetry } from "./retry"
import { StatsCollector } from "./stats"
import { apiCachePath, apiHubDir } from "./paths"

export interface HubOptions {
  projectRoot?: string
  cachePath?: string
  credentials?: Record<string, ApiCredential>
  fetch?: Fetcher
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class ApiHubError extends Error {
  constructor(
    readonly adapter: string,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(`${adapter}: ${message}`)
    this.name = "ApiHubError"
  }
}

export class HubImpl implements ApiHub {
  private limiters = new Map<string, RateLimiter>()
  private cache: ResponseCache
  private stats = new StatsCollector()
  private adapters = new Map<string, ApiDescriptor>()
  private tests = new Map<string, (credential: ApiCredential) => { path: string; params?: Record<string, string>; headers?: Record<string, string> }>()
  private credentials: Record<string, ApiCredential>
  private fetcher: Fetcher

  constructor(options: HubOptions = {}) {
    if (options.projectRoot) mkdirSync(apiHubDir(options.projectRoot), { recursive: true })
    this.cache = new ResponseCache(options.cachePath ?? (options.projectRoot ? apiCachePath(options.projectRoot) : ":memory:"))
    this.credentials = options.credentials ?? {}
    this.fetcher = options.fetch ?? fetch
  }

  register<TReq, TRes>(adapter: ApiAdapter<TReq, TRes>): void {
    const descriptor = adapter.descriptor
    this.adapters.set(descriptor.name, descriptor)
    this.limiters.set(descriptor.name, new RateLimiter(descriptor.rateLimit.rps, descriptor.rateLimit.burst ?? 1))
    if (adapter.testRequest) this.tests.set(descriptor.name, adapter.testRequest)
  }

  async call<TReq, TRes>(adapter: ApiAdapter<TReq, TRes>, req: TReq): Promise<TRes> {
    const descriptor = adapter.descriptor
    if (!this.adapters.has(descriptor.name)) this.register(adapter)
    const credential = this.credential(descriptor.name)
    if (!descriptor.enabled || credential.enabled === false) {
      throw new ApiHubError(descriptor.name, "adapter is disabled", false)
    }
    this.stats.recordCall(descriptor.name)

    const request = adapter.buildRequest(req, credential)
    const url = this.url(credential.url ?? descriptor.baseUrl, request.path, request.params)
    const cached = this.cache.get(descriptor.name, url.toString())
    if (cached) {
      this.stats.recordSuccess(descriptor.name)
      return adapter.schema.parse(cached.value)
    }

    const limiter = this.limiters.get(descriptor.name)
    if (!limiter) throw new ApiHubError(descriptor.name, "adapter is not registered", false)
    await limiter.acquire()

    try {
      const result = await withRetry(async () => {
        const response = await this.fetcher(url, {
          headers: adapter.headers?.(req, credential),
          signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) {
          throw new ApiHubError(
            descriptor.name,
            response.status === 429 ? "rate limited" : `HTTP ${response.status}`,
            response.status === 429 || response.status >= 500,
            response.status,
          )
        }
        const payload = adapter.decode ? await adapter.decode(response) : await response.json()
        return adapter.schema.parse(payload)
      }, 3, 1000, (error) => error instanceof ApiHubError && error.retryable)

      if (descriptor.cacheTtlS > 0) this.cache.set(descriptor.name, url.toString(), result, descriptor.cacheTtlS)
      this.stats.recordSuccess(descriptor.name)
      return result
    } catch (error) {
      const wrapped = error instanceof ApiHubError
        ? error
        : new ApiHubError(descriptor.name, error instanceof Error ? error.message : String(error), false)
      this.stats.recordError(descriptor.name, wrapped.message)
      throw wrapped
    }
  }

  status(name: string): ApiStatus {
    const descriptor = this.adapters.get(name)
    const callsTotal = this.stats.getCallsTotal(name)
    const lastError = this.stats.getLastError(name)
    const disabled = descriptor?.enabled === false || this.credential(name).enabled === false
    const state = disabled ? "disabled" : lastError ? "failed" : callsTotal > 0 ? "healthy" : "idle"
    return {
      name,
      healthy: state === "healthy",
      state,
      lastError,
      lastCallAt: this.stats.getLastCallAt(name) || undefined,
      callsTotal,
      cacheHitRate: this.cache.hitRate(name),
      availableTokens: this.limiters.get(name)?.availableTokens ?? 0,
    }
  }

  list(): ApiDescriptor[] {
    return Array.from(this.adapters.values())
  }

  async test(name: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const descriptor = this.adapters.get(name)
    if (!descriptor) return { ok: false, latencyMs: 0, error: `Unknown adapter: ${name}` }
    const credential = this.credential(name)
    if (!descriptor.enabled || credential.enabled === false) return { ok: false, latencyMs: 0, error: "Adapter is disabled" }
    const request = this.tests.get(name)?.(credential) ?? { path: descriptor.testPath }
    const start = Date.now()
    this.stats.recordCall(name)
    await this.limiters.get(name)?.acquire()
    try {
      const response = await this.fetcher(this.url(credential.url ?? descriptor.baseUrl, request.path, request.params), {
        headers: request.headers,
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        this.stats.recordSuccess(name)
        return { ok: true, latencyMs: Date.now() - start }
      }
      const error = `HTTP ${response.status}`
      this.stats.recordError(name, error)
      return { ok: false, latencyMs: Date.now() - start, error }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.stats.recordError(name, message)
      return { ok: false, latencyMs: Date.now() - start, error: message }
    }
  }

  close(): void {
    this.cache.close()
  }

  private credential(name: string): ApiCredential {
    const credential = this.credentials[name] ?? {}
    return {
      key: resolveSecret(credential.key),
      mailto: resolveSecret(credential.mailto),
      url: credential.url,
      enabled: credential.enabled,
    }
  }

  private url(baseUrl: string, path: string, params?: Record<string, string>) {
    const url = new URL(path, baseUrl)
    Object.entries(params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
    return url
  }
}

export function resolveSecret(value?: string) {
  if (!value) return undefined
  const match = /^\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(value)
  if (!match) return value
  const name = match[1]
  if (!name) return undefined
  return process.env[name]
}
