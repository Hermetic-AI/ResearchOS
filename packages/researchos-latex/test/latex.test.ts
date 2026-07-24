import { describe, test, expect } from "bun:test"
import { parseBibtex, extractCiteKeys, formatCheck } from "../src/bibtex"
import { parseLogErrors } from "../src/compile"

describe("parseBibtex", () => {
  test("parses a single entry", () => {
    const bib = `@article{vaswani2017attention,
  title = {Attention Is All You Need},
  author = {Vaswani, Ashish},
  year = {2017}
}`
    const entries = parseBibtex(bib)
    expect(entries.length).toBe(1)
    expect(entries[0].key).toBe("vaswani2017attention")
    expect(entries[0].fields.title).toBe("Attention Is All You Need")
  })

  test("parses multiple entries", () => {
    const bib = `@inproceedings{a,\n  title = {A},\n  year = {2020}\n}\n\n@article{b,\n  title = {B},\n  year = {2021}\n}`
    expect(parseBibtex(bib).length).toBe(2)
  })
})

describe("extractCiteKeys", () => {
  test("extracts cite keys", () => {
    const keys = extractCiteKeys("\\cite{vaswani2017attention,devlin2018bert}")
    expect(keys).toContain("vaswani2017attention")
    expect(keys).toContain("devlin2018bert")
  })
})

describe("formatCheck", () => {
  test("detects missing title", () => {
    const issues = formatCheck("\\begin{document}\n\\section{Intro}")
    expect(issues.some((i) => i.rule === "missing-title")).toBe(true)
  })

  test("checks IEEE template compliance", () => {
    const issues = formatCheck("\\documentclass{article}\n\\begin{document}", "ieee")
    expect(issues.some((i) => i.rule === "ieee-class")).toBe(true)
  })
})

describe("parseLogErrors", () => {
  test("parses file:line:message errors", () => {
    const log = "main.tex:10: Undefined control sequence\nmain.tex:15: Missing $ inserted"
    const errors = parseLogErrors(log)
    expect(errors.length).toBe(2)
    expect(errors[0].file).toBe("main.tex")
    expect(errors[0].line).toBe(10)
  })
})
