import { gzipSync } from "node:zlib"
import { describe, expect, test } from "bun:test"
import { forwardLookup, inverseLookup, parseSynctex } from "../src/synctex"
import { loadSynctex } from "../src/synctex"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

// 符合 SyncTeX v1 文本块格式的最小样例
const SAMPLE = [
  "SyncTeX Version:1",
  "Input:1:F:/proj/paper/main.tex",
  "Input:2:F:/proj/paper/intro.tex",
  "Magnification:1000",
  "{1",
  "[1,10:1000000,5000000",
  "h1,11:1100000,5100000",
  "x2,3:2000000,6000000",
  "[2,4:2100000,6100000",
  "}1",
  "{2",
  "[1,42:1500000,7000000",
  "k2,9:2500000,8000000",
  "}2",
].join("\n")

describe("parseSynctex", () => {
  const index = parseSynctex(SAMPLE)

  test("parses inputs and records with page tracking", () => {
    expect(index.inputs.get(1)).toBe("F:/proj/paper/main.tex")
    expect(index.inputs.get(2)).toBe("F:/proj/paper/intro.tex")
    expect(index.records).toHaveLength(6)
    expect(index.records[5]).toEqual({ page: 2, tag: 2, line: 9, x: 2500000, y: 8000000 })
  })

  test("forward maps file/line to nearest record in pt", () => {
    const hit = forwardLookup(index, "main.tex", 9)
    expect(hit?.page).toBe(1)
    expect(hit?.x).toBeCloseTo(1000000 / 65536, 3)
    expect(hit?.y).toBeCloseTo(5000000 / 65536, 3)
  })

  test("forward respects the input file", () => {
    expect(forwardLookup(index, "intro.tex", 3)?.page).toBe(1)
    expect(forwardLookup(index, "intro.tex", 9)?.page).toBe(2)
  })

  test("inverse maps page coordinates back to file/line", () => {
    const hit = inverseLookup(index, 2, 2490000 / 65536, 8010000 / 65536)
    expect(hit?.file).toBe("F:/proj/paper/intro.tex")
    expect(hit?.line).toBe(9)
  })

  test("returns null for unknown files", () => {
    expect(forwardLookup(index, "missing.tex", 1)).toBeNull()
  })
})

describe("loadSynctex", () => {
  test("roundtrips through gzip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "synctex-test-"))
    const path = join(dir, "main.synctex.gz")
    await writeFile(path, gzipSync(Buffer.from(SAMPLE, "utf8")))
    const index = await loadSynctex(path)
    expect(index.records).toHaveLength(6)
    expect(forwardLookup(index, "main.tex", 10)?.page).toBe(1)
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })
})
