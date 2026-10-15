interface AdapterStats {
  callsTotal: number
  lastCallAt: number
  lastError?: string
  lastSuccessAt: number
}

export class StatsCollector {
  private stats = new Map<string, AdapterStats>()

  recordCall(name: string): void {
    const s = this.ensure(name)
    s.callsTotal++
    s.lastCallAt = Date.now()
  }

  recordSuccess(name: string): void {
    const s = this.ensure(name)
    s.lastSuccessAt = Date.now()
    s.lastError = undefined
  }

  recordError(name: string, error: string): void {
    const s = this.ensure(name)
    s.lastError = error
  }

  get(name: string): AdapterStats {
    return this.ensure(name)
  }

  getCallsTotal(name: string): number {
    return this.ensure(name).callsTotal
  }

  getLastCallAt(name: string): number {
    return this.ensure(name).lastCallAt
  }

  getLastError(name: string): string | undefined {
    return this.ensure(name).lastError
  }

  getLastSuccessAt(name: string): number {
    return this.ensure(name).lastSuccessAt
  }

  private ensure(name: string): AdapterStats {
    const existing = this.stats.get(name)
    if (existing) return existing
    const s: AdapterStats = { callsTotal: 0, lastCallAt: 0, lastSuccessAt: 0 }
    this.stats.set(name, s)
    return s
  }
}
