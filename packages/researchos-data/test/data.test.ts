import { describe, test, expect } from "bun:test"
import { profileFromCsv } from "../src/analysis"

describe("profileFromCsv", () => {
  test("profiles a simple CSV", () => {
    const csv = "Name,Age,Score\nAlice,30,95\nBob,25,88"
    const result = profileFromCsv(csv, "test.csv")
    expect(result.rows).toBe(2)
    expect(result.columns).toBe(3)
    expect(result.schema.map((s) => s.name)).toEqual(["Name", "Age", "Score"])
    expect(result.stats["Age"].count).toBe(2)
  })

  test("handles empty CSV", () => {
    const result = profileFromCsv("header\n", "empty.csv")
    expect(result.rows).toBe(0)
  })
})
