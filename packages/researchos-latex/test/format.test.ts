import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { formatCheck } from "../src/format"

const MAIN = [
  "\\documentclass[conference]{IEEEtran}",
  "\\begin{document}",
  "\\begin{abstract}",
  "Short abstract.",
  "\\end{abstract}",
  "\\section{Introduction to the Method}",
  "Citing \\cite{vaswani2017attention} and \\cite{missing2020key}.",
  "Also \\ref{fig:demo} and \\ref{eq:nope}.",
  "\\begin{figure}",
  "\\includegraphics{demo.png}",
  "\\end{figure}",
  "\\bibliography{refs}",
  "\\end{document}",
].join("\n")

const REFS = [
  "@article{vaswani2017attention,",
  "  title = {Attention Is All You Need},",
  "  year = {2017}",
  "}",
  "@article{orphan2021entry,",
  "  title = {Never Cited},",
  "  year = {2021}",
  "}",
].join("\n")

describe("formatCheck", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "latex-format-"))
    await writeFile(join(dir, "main.tex"), MAIN)
    await writeFile(join(dir, "refs.bib"), REFS)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("reports missing cite keys and unused bib entries", () => {
    const { issues } = formatCheck({ projectRoot: dir, mainFile: "main.tex" })
    const missing = issues.filter((issue) => issue.rule === "missing-cite-key")
    expect(missing).toHaveLength(1)
    expect(missing[0]?.message).toContain("missing2020key")
    expect(missing[0]?.line).toBe(7)
    const unused = issues.filter((issue) => issue.rule === "unused-bib-entry")
    expect(unused).toHaveLength(1)
    expect(unused[0]?.message).toContain("orphan2021entry")
    expect(unused[0]?.severity).toBe("info")
  })

  test("reports figure without caption/label and undefined refs", () => {
    const { issues } = formatCheck({ projectRoot: dir, mainFile: "main.tex" })
    expect(issues.some((issue) => issue.rule === "figure-without-caption" && issue.line === 9)).toBe(true)
    expect(issues.some((issue) => issue.rule === "figure-without-label" && issue.line === 9)).toBe(true)
    const refs = issues.filter((issue) => issue.rule === "undefined-ref")
    expect(refs).toHaveLength(2)
    expect(refs.map((issue) => issue.line)).toEqual([8, 8])
  })

  test("reports unbalanced braces with the offending line", async () => {
    await writeFile(join(dir, "broken.tex"), "\\section{Unclosed\nmore text\n")
    const { issues } = formatCheck({ projectRoot: dir, mainFile: "broken.tex" })
    expect(issues.some((issue) => issue.rule === "unbalanced-braces")).toBe(true)
  })

  test("ieee template rules flag pagestyle and non-title-case sections", async () => {
    await writeFile(join(dir, "ieee.tex"), [
      "\\documentclass[conference]{IEEEtran}",
      "\\pagestyle{empty}",
      "\\begin{document}",
      "\\section{introduction to our method}",
      "\\end{document}",
    ].join("\n"))
    const { issues } = formatCheck({ projectRoot: dir, mainFile: "ieee.tex", template: "ieee" })
    expect(issues.some((issue) => issue.rule === "ieee-pagestyle")).toBe(true)
    expect(issues.some((issue) => issue.rule === "ieee-section-title-case")).toBe(true)
  })

  test("acm template rules require acmConference and matched affiliations", async () => {
    await writeFile(join(dir, "acm.tex"), [
      "\\documentclass{acmart}",
      "\\begin{document}",
      "\\author{Alice}",
      "\\author{Bob}",
      "\\affiliation{\\institution{Only One}}",
      "\\end{document}",
    ].join("\n"))
    const { issues } = formatCheck({ projectRoot: dir, mainFile: "acm.tex", template: "acm" })
    expect(issues.some((issue) => issue.rule === "acm-conference")).toBe(true)
    expect(issues.some((issue) => issue.rule === "acm-author-affiliation")).toBe(true)
  })

  test("follows \\input chains when collecting labels", async () => {
    await mkdir(join(dir, "sections"), { recursive: true })
    await writeFile(join(dir, "sections", "labels.tex"), "\\begin{equation}\\label{eq:nope}\\end{equation}\n")
    await writeFile(join(dir, "chained.tex"), [
      "\\documentclass{article}",
      "\\begin{document}",
      "See \\ref{eq:nope}.",
      "\\input{sections/labels}",
      "\\bibliography{refs}",
      "\\end{document}",
    ].join("\n"))
    const { issues } = formatCheck({ projectRoot: dir, mainFile: "chained.tex" })
    expect(issues.filter((issue) => issue.rule === "undefined-ref")).toHaveLength(0)
  })

  test("rejects main files outside the project root", () => {
    expect(() => formatCheck({ projectRoot: dir, mainFile: "../outside.tex" })).toThrow(/escapes project root/)
  })
})
