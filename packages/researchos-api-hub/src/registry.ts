import type { ZodType } from "zod"

export interface ApiDescriptor {
  name: string
  description: string
  baseUrl: string
  auth: "none" | "api_key" | "bearer" | "mailto"
  rateLimit: { rps: number; burst?: number }
  cacheTtlS: number
  enabled: boolean
  testPath: string
}

export interface ApiCredential {
  key?: string
  mailto?: string
  url?: string
  enabled?: boolean
}

export interface ApiAdapter<TReq, TRes> {
  descriptor: ApiDescriptor
  buildRequest: (req: TReq, credential: ApiCredential) => { path: string; params?: Record<string, string> }
  schema: ZodType<TRes>
  headers?: (req: TReq, credential: ApiCredential) => Record<string, string>
  decode?: (response: Response) => Promise<unknown>
  testRequest?: (credential: ApiCredential) => { path: string; params?: Record<string, string>; headers?: Record<string, string> }
}

export interface ApiStatus {
  name: string
  healthy: boolean
  state: "idle" | "healthy" | "failed" | "disabled"
  lastError?: string
  lastCallAt?: number
  callsTotal: number
  cacheHitRate: number
  availableTokens: number
}

export interface ApiHub {
  call<TReq, TRes>(adapter: ApiAdapter<TReq, TRes>, req: TReq): Promise<TRes>
  status(name: string): ApiStatus
  list(): ApiDescriptor[]
  test(name: string): Promise<{ ok: boolean; latencyMs: number; error?: string }>
}
