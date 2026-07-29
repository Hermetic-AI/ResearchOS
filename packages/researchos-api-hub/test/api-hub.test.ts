import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "fs"
import path from "path"
import { tmpdir } from "os"
import { z } from "zod"
import { HubImpl, resolveSecret } from "../src/hub"
import { RateLimiter } from "../src/rate-limiter"
import { ResponseCache } from "../src/cache"
import { withRetry } from "../src/retry"
import { StatsCollector } from "../src/stats"
import { parseArxivXml } from "../src/adapters/arxiv"
import { semanticScholarCitationsAdapter } from "../src/adapters/semantic-scholar"

describe("RateLimiter", () => {
  test("allows configured burst immediately", async () => {
    const limiter = new RateLimiter(2, 2)
    const start = Date.now()
    await Promise.all([limiter.acquire(), limiter.acquire()])
    expect(Date.now() - start).toBeLessThan(100)
  })

  test("serializes requests after burst is exhausted", async () => {
    const limiter = new RateLimiter(2)
    await limiter.acquire()
    const start = Date.now()
    await limiter.acquire()
    expect(Date.now() - start).toBeGreaterThanOrEqual(400)
  }, 5000)
})

describe("ResponseCache", () => {
  test("persists values in SQLite between instances", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "researchos-api-cache-"))
    const filename = path.join(directory, "cache.db")
    const writer = new ResponseCache(filename)
    writer.set("crossref", "https://example.test?q=x", { id: 1 }, 60)
    writer.close()

    const reader = new ResponseCache(filename)
    expect(reader.get("crossref", "https://example.test?q=x")?.value).toEqual({ id: 1 })
    reader.close()
  })

  test("expires entries and tracks hit rate", async () => {
    const cache = new ResponseCache()
    cache.set("test", "a", 1, 60)
    cache.get("test", "a")
    cache.set("test", "expired", 1, 0)
    await Bun.sleep(2)
    expect(cache.get("test", "expired")).toBeNull()
    expect(cache.hitRate("test")).toBe(0.5)
    cache.close()
  })
})

describe("withRetry", () => {
  test("retries accepted failures only", async () => {
    let attempts = 0
    const result = await withRetry(() => {
      attempts++
      if (attempts < 2) throw new Error("transient")
      return Promise.resolve("ok")
    }, 3, 1, () => true)
    expect(result).toBe("ok")
    expect(attempts).toBe(2)
  })

  test("does not retry rejected failures", async () => {
    let attempts = 0
    expect(withRetry(() => {
      attempts++
      return Promise.reject(new Error("schema"))
    }, 3, 1, () => false)).rejects.toThrow("schema")
    expect(attempts).toBe(1)
  })
})

describe("adapters", () => {
  test("parses a recorded arXiv Atom fixture", async () => {
    const parsed = parseArxivXml(await Bun.file(new URL("./fixtures/arxiv.xml", import.meta.url)).text())
    expect(parsed.feed.entry).toHaveLength(1)
    expect(parsed.feed.entry[0]?.title.replace(/\s+/g, " ").trim()).toBe("A Reliable & Reproducible Research System")
    expect(parsed.feed.entry[0]?.author.map((author) => author.name)).toEqual(["Ada Lovelace", "Alan Turing"])
    expect(parsed.feed.entry[0]?.link.find((link) => link.title === "pdf")?.href).toContain("/pdf/")
  })

  test("semanticScholarCitationsAdapter builds the citations path and parses citing papers", async () => {
    const request = semanticScholarCitationsAdapter.buildRequest({ paperId: "DOI:10.1000/xyz", limit: 5 }, {})
    expect(request.path).toBe("/graph/v1/paper/DOI:10.1000/xyz/citations")
    expect(request.params?.limit).toBe("5")
    expect(request.params?.fields).toContain("externalIds")

    const hub = new HubImpl({
      fetch: async () => Response.json({
        data: [{
          citingPaper: {
            paperId: "s2-citing-1",
            title: "A Citing Work",
            authors: [{ name: "Grace Hopper" }],
            year: 2024,
            externalIds: { DOI: "10.1000/citing" },
            citationCount: 3,
          },
        }],
      }),
    })
    const result = await hub.call(semanticScholarCitationsAdapter, { paperId: "DOI:10.1000/xyz" })
    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.citingPaper.title).toBe("A Citing Work")
    expect(result.data[0]?.citingPaper.externalIds?.DOI).toBe("10.1000/citing")
    hub.close()
  })
})

describe("HubImpl", () => {
  test("runs fetch, schema validation, and cache as one pipeline", async () => {
    let calls = 0
    const hub = new HubImpl({
      fetch: async () => {
        calls++
        return Response.json({ value: 42, ignored: true })
      },
    })
    const adapter = {
      descriptor: {
        name: "fixture",
        description: "Fixture API",
        baseUrl: "https://example.test",
        auth: "none" as const,
        rateLimit: { rps: 100 },
        cacheTtlS: 60,
        enabled: true,
        testPath: "/health",
      },
      buildRequest: () => ({ path: "/value" }),
      schema: z.object({ value: z.number() }),
    }

    expect(await hub.call(adapter, {})).toEqual({ value: 42 })
    expect(await hub.call(adapter, {})).toEqual({ value: 42 })
    expect(calls).toBe(1)
    expect(hub.status("fixture").cacheHitRate).toBe(0.5)
    hub.close()
  })

  test("resolves env references without sending the placeholder", () => {
    process.env.RESEARCHOS_TEST_KEY = "secret"
    expect(resolveSecret("{env:RESEARCHOS_TEST_KEY}")).toBe("secret")
    expect(resolveSecret("{env:MISSING_RESEARCHOS_KEY}")).toBeUndefined()
    expect(resolveSecret("literal")).toBe("literal")
    delete process.env.RESEARCHOS_TEST_KEY
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
