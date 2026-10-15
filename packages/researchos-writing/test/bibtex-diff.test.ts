import { describe, expect, test } from "bun:test"
import { extractBibKeys, mergeBibtex } from "../src/bibtex"
import { applyHunks, hunksFromRewrite, splitSentences, wordDiff } from "../src/diff"

describe("bibtex", () => {
  test("extracts keys and skips duplicates on merge", () => {
    const existing = "@article{a2020one,\n  title = {One}\n}\n"
    expect(extractBibKeys(existing)).toEqual(["a2020one"])
    const merged = mergeBibtex(existing, [
      { key: "a2020one", bibtex: "@article{a2020one,\n  title = {Duplicate}\n}" },
      { key: "b2021two", bibtex: "@article{b2021two,\n  title = {Two}\n}" },
    ])
    expect(merged.inserted).toEqual(["b2021two"])
    expect(merged.skipped).toEqual(["a2020one"])
    expect(merged.content).toContain("title = {One}")
    expect(merged.content).not.toContain("Duplicate")
    expect(extractBibKeys(merged.content).sort()).toEqual(["a2020one", "b2021two"])
  })
})

describe("word diff and hunks", () => {
  test("diffWords marks additions and removals", () => {
    const parts = wordDiff("the quick fox", "the fast fox")
    expect(parts.some((part) => part.removed && part.value.includes("quick"))).toBe(true)
    expect(parts.some((part) => part.added && part.value.includes("fast"))).toBe(true)
  })

  test("sentence split and hunk alignment skip identical sentences", () => {
    expect(splitSentences("One two. Three four! Five?")).toEqual(["One two.", "Three four!", "Five?"])
    const hunks = hunksFromRewrite(
      "We use attention. The model is small. It works.",
      "We use attention. The model is compact and efficient. It works.",
    )
    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.original).toBe("The model is small.")
    expect(hunks[0]?.revised).toBe("The model is compact and efficient.")
  })

  test("applyHunks keeps originals for rejected hunks", () => {
    const original = "A is bad. B stays."
    const revised = "A is good. B stays."
    expect(applyHunks(original, revised, new Set())).toBe("A is bad. B stays.")
    expect(applyHunks(original, revised, new Set([0]))).toBe("A is good. B stays.")
  })
})
