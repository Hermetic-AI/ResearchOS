import { describe, expect, test } from "bun:test"
import { extractPdfText } from "../../src/pdf/extract"
import { makePdf } from "../fixtures/pdf"

const PAGES = [
  ["Attention Is All You Need", "Ashish Vaswani, Noam Shazeer", "2017"],
  ["References", "[1] Someone. A title. 2020."],
]

describe("extractPdfText", () => {
  test("extracts text lines from all pages", async () => {
    const text = await extractPdfText(makePdf(PAGES))
    expect(text).toContain("Attention Is All You Need")
    expect(text).toContain("Ashish Vaswani, Noam Shazeer")
    expect(text).toContain("References")
  })

  test("respects maxPages and allows repeated extraction of the same buffer", async () => {
    const data = makePdf(PAGES)
    const first = await extractPdfText(data, 1)
    expect(first).toContain("Attention Is All You Need")
    expect(first).not.toContain("References")
    // 同一 buffer 二次提取（import 流程先取前 3 页再取全文）
    const full = await extractPdfText(data)
    expect(full).toContain("References")
  })
})
