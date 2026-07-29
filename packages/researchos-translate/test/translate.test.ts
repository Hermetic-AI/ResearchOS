import { describe, expect, test } from "bun:test"
import { buildTranslationResult, extractGlossary, preserveFormula, restoreFormula, splitIntoSections, toBilingualHtml } from "../src/translate"
describe("academic translation transforms", () => {
  test("splits common paper headings into aligned sections", () => { const sections = splitIntoSections("Abstract\nFirst paragraph.\nIntroduction\nSecond paragraph."); expect(sections.map((section) => section.type)).toEqual(["abstract", "introduction"]); expect(sections[1]?.paragraphs).toEqual(["Second paragraph."]) })
  test("protects formulas, measurements, and figure references", () => { const source = "Fig. 3 reports $E=mc^2$ at 95%."; const masked = preserveFormula(source); expect(masked.formulas).toEqual(["Fig. 3", "$E=mc^2$", "95%"]); expect(restoreFormula(masked.text, masked.formulas)).toBe(source) })
  test("does not fabricate glossary terms or translations", () => { const sections = [{ type: "abstract" as const, title: "Abstract", paragraphs: ["Original"] }]; const result = buildTranslationResult("paper", sections); expect(result.sections[0]?.translated).toEqual([]); expect(extractGlossary("anything")).toEqual([]) })
  test("escapes source and translation in bilingual HTML", () => { const result = buildTranslationResult("p", [{ type: "abstract", title: "Abstract", paragraphs: ["<script>"] }], [["译文"]]); const html = toBilingualHtml(result); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>") })
})
