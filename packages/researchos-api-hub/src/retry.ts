export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  shouldRetry: (error: unknown) => boolean = () => true,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxRetries || !shouldRetry(err)) break
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}
