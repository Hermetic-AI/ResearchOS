import { describe, expect, test } from "bun:test"
import { chunkPaperText } from "../src/chunk"

// 生成约 length 字符、词与词互不相同的段落，避免重叠断言被重复内容糊弄
function paragraph(tag: string, words: number): string {
  return Array.from({ length: words }, (_, i) => `${tag}word${i}`).join(" ")
}

describe("chunkPaperText", () => {
  test("detects numbered headings and keeps their labels as sections", () => {
    const chunks = chunkPaperText([
      "1. Introduction",
      "intro body text",
      "",
      "2 Methods",
      "methods body text",
      "",
      "10. Conclusion",
      "conclusion body text",
    ].join("\n"))
    expect(chunks.map((chunk) => chunk.section)).toEqual(["1. Introduction", "2 Methods", "10. Conclusion"])
    expect(chunks[0]?.text).toContain("intro body text")
  })

  test("does not treat numbered sentences ending with punctuation as headings", () => {
    const chunks = chunkPaperText([
      "1. Introduction",
      "intro body text",
      "3. This enumerates a finding in prose.",
    ].join("\n"))
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.section).toBe("1. Introduction")
    expect(chunks[0]?.text).toContain("3. This enumerates a finding in prose.")
  })

  test("detects bare known headings case-insensitively", () => {
    const chunks = chunkPaperText([
      "abstract",
      "abstract body text",
      "",
      "DISCUSSION",
      "discussion body text",
    ].join("\n"))
    expect(chunks.map((chunk) => chunk.section)).toEqual(["abstract", "DISCUSSION"])
  })

  test("packs heading-less paragraphs up to the target size with overlap", () => {
    const first = paragraph("a", 60)
    const second = paragraph("b", 60)
    const third = paragraph("c", 60)
    const chunks = chunkPaperText([first, second, third].join("\n\n"))
    expect(chunks).toHaveLength(2)
    expect(chunks.every((chunk) => chunk.section === null)).toBe(true)
    expect(chunks[0]?.text).toContain("aword0")
    expect(chunks[0]?.text).toContain("bword59")
    expect(chunks[1]?.text).toContain("cword59")
    // 重叠尾部可能被 trim 掉前导空格，用包含关系断言而非严格前缀
    expect(chunks[0]!.text.slice(-200)).toContain(chunks[1]!.text.slice(0, 150))
  })

  test("splits an overlong paragraph into overlapping chunks within its section", () => {
    const chunks = chunkPaperText(["2 Methods", paragraph("m", 500)].join("\n"))
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.section === "2 Methods")).toBe(true)
    expect(chunks[0]!.text.slice(-200)).toContain(chunks[1]!.text.slice(0, 150))
  })

  test("never carries overlap across a section boundary", () => {
    const chunks = chunkPaperText([
      "1. Introduction",
      paragraph("i", 300),
      "",
      "2 Methods",
      "fresh section body",
    ].join("\n"))
    const last = chunks.at(-1)
    expect(last?.section).toBe("2 Methods")
    expect(last?.text.startsWith("fresh section body")).toBe(true)
  })

  test("drops the references section and everything after it", () => {
    const chunks = chunkPaperText([
      "1. Introduction",
      "kept body text",
      "",
      "7. References",
      "[1] dropped citation entry",
      "",
      "appendix",
      "also dropped appendix text",
    ].join("\n"))
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.text).toContain("kept body text")
    expect(chunks.some((chunk) => chunk.text.includes("dropped"))).toBe(false)
  })
})
