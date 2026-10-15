import { describe, expect, test } from "bun:test"
import { parseGrobidReferences } from "../../src/pdf/grobid"

const TEI = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <text><back><div type="references"><listBibl>
    <biblStruct xml:id="b0">
      <analytic>
        <title level="a">Neural machine translation by jointly learning to align and translate</title>
        <author><persName><forename>Dzmitry</forename><surname>Bahdanau</surname></persName></author>
      </analytic>
      <monogr>
        <title level="j">CoRR</title>
        <imprint><date type="published" when="2014-09-01"/></imprint>
      </monogr>
      <idno type="DOI">10.48550/arXiv.1409.0473</idno>
    </biblStruct>
    <biblStruct xml:id="b1">
      <monogr>
        <title level="m">Long short-term memory</title>
        <imprint><date type="published" when="1997"/></imprint>
      </monogr>
      <idno type="arXiv">2103.00020</idno>
    </biblStruct>
  </listBibl></div></back></text>
</TEI>`

describe("parseGrobidReferences", () => {
  const refs = parseGrobidReferences(TEI)

  test("parses one entry per biblStruct", () => {
    expect(refs.length).toBe(2)
  })

  test("prefers the analytic title and reads DOI idno", () => {
    expect(refs[0]?.title).toBe("Neural machine translation by jointly learning to align and translate")
    expect(refs[0]?.doi).toBe("10.48550/arXiv.1409.0473")
    expect(refs[0]?.year).toBe(2014)
  })

  test("falls back to monogr title and reads arXiv idno", () => {
    expect(refs[1]?.title).toBe("Long short-term memory")
    expect(refs[1]?.arxivId).toBe("2103.00020")
    expect(refs[1]?.year).toBe(1997)
  })

  test("raw holds the flattened text of the entry", () => {
    expect(refs[0]?.raw).toContain("Bahdanau")
    expect(refs[0]?.raw).not.toContain("<")
  })
})
