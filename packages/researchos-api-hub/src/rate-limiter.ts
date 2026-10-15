export class RateLimiter {
  private tokens: number
  private lastRefill = Date.now()
  private queue = Promise.resolve()

  constructor(
    private rps: number,
    private capacity = 1,
  ) {
    if (rps <= 0) throw new Error("Rate limit must be greater than zero")
    this.tokens = capacity
  }

  acquire(): Promise<void> {
    const pending = this.queue.then(async () => {
      this.refill()
      if (this.tokens >= 1) {
        this.tokens--
        return
      }
      const waitMs = Math.ceil((1 - this.tokens) * 1000 / this.rps)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      this.refill()
      this.tokens = Math.max(0, this.tokens - 1)
    })
    this.queue = pending
    return pending
  }

  get availableTokens(): number {
    this.refill()
    return Math.floor(this.tokens)
  }

  private refill(): void {
    const now = Date.now()
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.lastRefill) / 1000 * this.rps)
    this.lastRefill = now
  }
}
