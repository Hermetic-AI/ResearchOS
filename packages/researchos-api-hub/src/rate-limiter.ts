export class RateLimiter {
  private nextAllowed: number = 0

  constructor(private rps: number) {
    this.nextAllowed = Date.now()
  }

  async acquire(): Promise<void> {
    const now = Date.now()
    if (now >= this.nextAllowed) {
      this.nextAllowed = now + 1000 / this.rps
      return
    }
    const waitMs = this.nextAllowed - now
    this.nextAllowed += 1000 / this.rps
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }

  get availableTokens(): number {
    const now = Date.now()
    return now >= this.nextAllowed ? 1 : 0
  }
}
