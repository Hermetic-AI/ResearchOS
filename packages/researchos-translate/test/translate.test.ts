import { describe, test, expect } from "bun:test"
import { splitIntoSections, preserveFormula, restoreFormula, stubTranslate, buildTranslationResult, extractGlossary, toBilingualHtml } from "../src/translate"

describe("translate", () => {
  test("stubTranslate wraps text", () => {
    expect(stubTranslate("Hello world")).toBe("[译] Hello world")
  })

  test("preserveFormula saves and restores formulas", () => {
    const text = "Energy is $E=mc^2$ and force is $$F=ma$$"
    const { text: preserved, formulas } = preserveFormula(text)
    expect(preserved).not.toContain("$E=mc^2$")
    expect(formulas.length).toBe(2)
    const restored = restoreFormula(preserved, formulas)
    expect(restored).toBe(text)
  })

  test("extractGlossary returns default terms", () => {
    const glossary = extractGlossary("")
    expect(glossary.length).toBe(2)
    expect(glossary[0].en).toBe("attention")
    expect(glossary[0].zh).toBe("注意力")
  })

  test("buildTranslationResult creates structured output", () => {
    const sections = [{ type: "abstract" as const, title: "Abstract", paragraphs: ["This is the abstract."] }]
    const result = buildTranslationResult("paper-001", sections)
    expect(result.paperId).toBe("paper-001")
    expect(result.sections[0].translated[0]).toBe("[译] This is the abstract.")
  })

  test("toBilingualHtml generates HTML", () => {
    const sections = [{ type: "abstract" as const, title: "Abstract", paragraphs: ["Original text."] }]
    const result = buildTranslationResult("p1", sections)
    const html = toBilingualHtml(result)
    expect(html).toContain("Original text.")
    expect(html).toContain("[译] Original text.")
  })
})
