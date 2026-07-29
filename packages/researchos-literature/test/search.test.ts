import { describe, expect, test } from "bun:test"
import { HubImpl } from "@researchos/api-hub"
import { deduplicate, search } from "../src/search"

describe("multi-source literature search", () => {
  test("normalizes four sources and merges duplicate DOI records", async () => {
    const hub = new HubImpl({ fetch: fixtureFetch })
    const results = await search("research systems", { limit: 10, hub })

    expect(results).toHaveLength(3)
    expect(results[0]?.doi).toBe("10.1000/shared")
    expect(results[0]?.citationCount).toBe(19)
    expect(results.find((paper) => paper.source === "pubmed")?.title).toBe("Biomedical Research Systems")
    hub.close()
  })

  test("deduplicates normalized DOI, arXiv version, and punctuation-insensitive title", () => {
    const make = (overrides: Partial<Parameters<typeof deduplicate>[0][number]>) => ({
      id: crypto.randomUUID(),
      doi: null,
      arxivId: null,
      title: "A Research-System",
      year: null,
      venue: null,
      authors: [],
      abstract: null,
      citationCount: 0,
      source: "manual" as const,
      ...overrides,
    })
    expect(deduplicate([make({ doi: "10.1000/TEST" }), make({ doi: "https://doi.org/10.1000/test" })])).toHaveLength(1)
    expect(deduplicate([make({ arxivId: "2401.00001v1" }), make({ arxivId: "2401.00001v3" })])).toHaveLength(1)
    expect(deduplicate([make({}), make({ title: "a research system!" })])).toHaveLength(1)
  })
})

async function fixtureFetch(input: string | URL | Request) {
  const url = new URL(input instanceof Request ? input.url : input)
  if (url.hostname === "export.arxiv.org") {
    return new Response(`
      <feed xmlns="http://www.w3.org/2005/Atom"><entry>
        <id>https://arxiv.org/abs/2401.00001v1</id>
        <published>2024-01-01T00:00:00Z</published>
        <title>Reliable Research Systems</title>
        <summary>An arXiv abstract.</summary>
        <author><name>Ada Lovelace</name></author>
        <link title="doi" href="https://doi.org/10.1000/shared"/>
      </entry></feed>
    `)
  }
  if (url.hostname === "api.semanticscholar.org") {
    return Response.json({
      data: [{
        paperId: "s2-1",
        title: "Reliable Research Systems",
        authors: [{ name: "Ada Lovelace" }],
        year: 2024,
        externalIds: { DOI: "10.1000/SHARED" },
        citationCount: 19,
      }],
    })
  }
  if (url.hostname === "api.crossref.org") {
    return Response.json({
      message: {
        items: [{
          DOI: "10.1000/crossref",
          title: ["A Different Research Work"],
          author: [{ given: "Grace", family: "Hopper" }],
          issued: { "date-parts": [[2023]] },
          "container-title": ["Journal of Research"],
        }],
      },
    })
  }
  if (url.pathname.endsWith("/esearch.fcgi")) {
    return Response.json({ esearchresult: { idlist: ["123"], count: "1" } })
  }
  return Response.json({
    result: {
      uids: ["123"],
      "123": {
        uid: "123",
        title: "Biomedical Research Systems",
        authors: [{ name: "Katherine Johnson" }],
        pubdate: "2022 Jan",
        source: "Science",
        articleids: [{ idtype: "doi", value: "10.1000/pubmed" }],
      },
    },
  })
}
