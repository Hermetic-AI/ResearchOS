import { describe, expect, test } from "bun:test"
import { parseReferences } from "../../src/pdf/references"

const BRACKETED = [
  "The dominant sequence transduction models are based on complex recurrent networks.",
  "",
  "References",
  "[1] Dzmitry Bahdanau, Kyunghyun Cho, Yoshua Bengio. Neural machine translation by jointly learning to align and translate. In ICLR, 2015. doi: 10.48550/arXiv.1409.0473",
  "[2] Sepp Hochreiter and Jurgen Schmidhuber. Long short-term memory. Neural Computation, 9(8):1735-1780, 1997.",
  "[3] Alec Radford, Jong Wook Kim, Chris Hallacy. Learning transferable visual models from natural language supervision. In ICML, 2021. arXiv:2103.00020",
  "[4] Jacob Devlin, Ming-Wei Chang. BERT: Pre-training of deep bidirectional transformers for language understanding. In NAACL, 2019.",
].join("\n")

describe("parseReferences", () => {
  test("locates the References section after the body", () => {
    const refs = parseReferences(BRACKETED)
    expect(refs.length).toBe(4)
    expect(refs.every((ref) => !ref.raw.includes("dominant sequence"))).toBe(true)
  })

  test("uses the last heading occurrence to skip table of contents", () => {
    const text = `References\n\nBody text mentioning the section.\n\n${BRACKETED}`
    expect(parseReferences(text).length).toBe(4)
  })

  test("extracts DOI, arXiv ID, year and title from bracket-numbered entries", () => {
    const refs = parseReferences(BRACKETED)
    expect(refs[0]?.doi).toBe("10.48550/arXiv.1409.0473")
    expect(refs[0]?.year).toBe(2015)
    expect(refs[0]?.title).toBe("Neural machine translation by jointly learning to align and translate")
    expect(refs[1]?.title).toBe("Long short-term memory")
    expect(refs[1]?.year).toBe(1997)
    expect(refs[2]?.arxivId).toBe("2103.00020")
    expect(refs[3]?.title).toBe("BERT: Pre-training of deep bidirectional transformers for language understanding")
  })

  test("splits dot-numbered entries", () => {
    const text = [
      "Body.",
      "",
      "References",
      "1. First Author, Second Author. A dot numbered reference about systems. Journal of Tests, 2010.",
      "2. Third Author. Another dot numbered reference about models. 2011. doi: 10.1000/numbered.two",
    ].join("\n")
    const refs = parseReferences(text)
    expect(refs.length).toBe(2)
    expect(refs[1]?.doi).toBe("10.1000/numbered.two")
    expect(refs[1]?.title).toBe("Another dot numbered reference about models")
  })

  test("falls back to blank-line splitting for unnumbered entries", () => {
    const text = [
      "Body.",
      "",
      "Bibliography",
      "Vaswani, A. Attention is all you need. 2017.",
      "",
      "Devlin, J. BERT pre-training of transformers. 2018.",
    ].join("\n")
    const refs = parseReferences(text)
    expect(refs.length).toBe(2)
    expect(refs[0]?.year).toBe(2017)
  })

  test("returns empty array when no reference section exists", () => {
    expect(parseReferences("Just some body text without a bibliography.")).toEqual([])
  })
})
