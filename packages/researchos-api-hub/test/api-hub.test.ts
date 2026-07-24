import { describe, test, expect } from "bun:test"
import { HubImpl } from "../src/hub"
import { RateLimiter } from "../src/rate-limiter"
import { ResponseCache } from "../src/cache"
import { withRetry } from "../src/retry"
import { StatsCollector } from "../src/stats"

describe("RateLimiter", () => {
  test("allows first request immediately", async () => {
    const limiter = new RateLimiter(100)
    const start = Date.now()
    await limiter.acquire()
    expect(Date.now() - start).toBeLessThan(50)
  })

  test("throttles rapid consecutive requests", async () => {
    const limiter = new RateLimiter(2)
    await limiter.acquire()
    const start = Date.now()
    await limiter.acquire()
    expect(Date.now() - start).toBeGreaterThan(400)
  }, 5000)
})

describe("ResponseCache", () => {
  test("stores and retrieves values", () => {
    const cache = new ResponseCache()
    cache.set("test", '{"q":"x"}', { id: 1 }, 60)
    const result = cache.get("test", '{"q":"x"}')
    expect(result).not.toBeNull()
  })

  test("expires entries", async () => {
    const cache = new ResponseCache()
    cache.set("test", '{"q":"x"}', { id: 1 }, 0)
    await new Promise((r) => setTimeout(r, 10))
    const result = cache.get("test", '{"q":"x"}')
    expect(result).toBeNull()
  })

  test("tracks hit rate", () => {
    const cache = new ResponseCache()
    cache.set("test", "a", 1, 60)
    cache.get("test", "a")
    cache.get("test", "b")
    const rate = cache.hitRate("test")
    expect(rate).toBe(0.5)
  })
})

describe("withRetry", () => {
  test("succeeds on first try", async () => {
    const result = await withRetry(() => Promise.resolve(42))
    expect(result).toBe(42)
  })

  test("retries on failure", async () => {
    let attempts = 0
    const result = await withRetry(() => {
      attempts++
      if (attempts < 2) throw new Error("fail")
      return Promise.resolve("ok")
    }, 3, 10)
    expect(result).toBe("ok")
    expect(attempts).toBe(2)
  })
})

describe("StatsCollector", () => {
  test("tracks call counts", () => {
    const stats = new StatsCollector()
    stats.recordCall("arxiv")
    stats.recordCall("arxiv")
    expect(stats.getCallsTotal("arxiv")).toBe(2)
  })
})

describe("HubImpl", () => {
  test("registers and lists adapters", () => {
    const hub = new HubImpl()
    hub.register({
      descriptor: {
        name: "test_api",
        description: "Test API",
        baseUrl: "https://example.com",
        auth: "none",
        rateLimit: { rps: 10 },
        cacheTtlS: 0,
        enabled: true,
      },
      buildRequest: () => ({ path: "/" }),
      schema: {} as any,
    })
    const list = hub.list()
    expect(list.length).toBe(1)
    const adapter = list[0]
    expect(adapter).toBeDefined()
    if (adapter) {
      expect(adapter.name).toBe("test_api")
    }
  })
})
