import type { ZodType } from "zod"

export interface ApiDescriptor {
  name: string
  description: string
  baseUrl: string
  auth: "none" | "api_key" | "bearer" | "mailto"
  rateLimit: { rps: number; burst?: number }
  cacheTtlS: number
  enabled: boolean
}

export interface ApiAdapter<TReq, TRes> {
  descriptor: ApiDescriptor
  buildRequest: (req: TReq) => { path: string; params?: Record<string, string> }
  schema: ZodType<TRes>
  headers?: (req: TReq) => Record<string, string>
}

export interface ApiStatus {
  name: string
  healthy: boolean
  lastError?: string
  lastCallAt?: number
  callsTotal: number
  cacheHitRate: number
  rpmCurrent: number
}

export interface ApiHub {
  call<TReq, TRes>(adapter: ApiAdapter<TReq, TRes>, req: TReq): Promise<TRes>
  status(name: string): ApiStatus
  list(): ApiDescriptor[]
  test(name: string): Promise<{ ok: boolean; latencyMs: number; error?: string }>
}
