import { describe, expect, test } from "bun:test"
import { type Table, formatP, pairedTTest, parseCsv, profile, sd, studentTwoSidedP, toLatexTable } from "../src/stats"

// Two-sided critical values from Student's t tables: t[c] is the value whose two-sided p equals p.
const TABLE: Array<{ df: number; t: number; p: number }> = [
  { df: 1, t: 12.706, p: 0.05 },
  { df: 2, t: 4.303, p: 0.05 },
  { df: 3, t: 3.182, p: 0.05 },
  { df: 3, t: 4.541, p: 0.02 },
  { df: 4, t: 2.776, p: 0.05 },
  { df: 5, t: 2.571, p: 0.05 },
  { df: 5, t: 4.032, p: 0.01 },
  { df: 8, t: 2.306, p: 0.05 },
  { df: 10, t: 2.228, p: 0.05 },
  { df: 10, t: 3.169, p: 0.01 },
  { df: 20, t: 2.086, p: 0.05 },
  { df: 30, t: 2.042, p: 0.05 },
]

describe("studentTwoSidedP", () => {
  test("reproduces t-table critical values", () => {
    for (const row of TABLE) expect(studentTwoSidedP(row.t, row.df)).toBeCloseTo(row.p, 3)
  })

  test("is monotone in |t| and symmetric", () => {
    expect(studentTwoSidedP(0, 10)).toBeCloseTo(1, 6)
    expect(studentTwoSidedP(-2.228, 10)).toBeCloseTo(studentTwoSidedP(2.228, 10), 10)
    expect(studentTwoSidedP(3.169, 10)).toBeLessThan(studentTwoSidedP(2.228, 10))
  })

  test("approaches the normal tail for large df", () => {
    expect(studentTwoSidedP(1.96, 5000)).toBeCloseTo(0.05, 2)
  })
})

describe("parseCsv / profile", () => {
  const csv = `seed,ddpm_fid,ddim_fid,note
1,18.42,6.87,run a
2,17.95,6.71,run b
3,18.88,7.02,
4,9.13,4.12,run d`

  test("types columns and skips blank cells", () => {
    const table = parseCsv(csv)
    expect(table.columns).toEqual(["seed", "ddpm_fid", "ddim_fid", "note"])
    expect(table.rows).toHaveLength(4)
    const cols = profile(table)
    expect(cols.map((column) => column.name)).toEqual(["seed", "ddpm_fid", "ddim_fid", "note"])
    expect(cols.map((column) => column.kind)).toEqual(["number", "number", "number", "text"])
    expect(cols.map((column) => [column.n, column.missing])).toEqual([[4, 0], [4, 0], [4, 0], [0, 1]])
    expect(cols.map((column) => [column.min, column.max])).toEqual([[1, 4], [9.13, 18.88], [4.12, 7.02], [null, null]])
    // means are the hand sums / 4; sd cross-checked with the population formula scaled by n/(n-1)
    expect(cols.map((column) => (column.mean === null ? null : Number(column.mean.toFixed(6))))).toEqual([2.5, 16.095, 6.18, null])
    expect(cols.map((column) => (column.sd === null ? null : Number(column.sd.toFixed(6))))).toEqual([1.290994, 4.65883, 1.379154, null])
  })

  test("empty input yields an empty table", () => {
    expect(parseCsv("")).toEqual({ columns: [], rows: [] })
  })

  test("sd is undefined for a single value", () => {
    expect(sd([3])).toBeUndefined()
    expect(sd([1, 2])).toBeCloseTo(0.7071067811865476, 10)
  })
})

describe("pairedTTest", () => {
  // Differences are +1/+2/+3/+4: mean 2.5, sd sqrt(5/3), se sd/2 -> t = 3.8729833, df = 3.
  const table = parseCsv("x,y\n10,9\n20,18\n30,27\n40,36")

  // Unwraps the result union so a failed test prints the validation message.
  function run(source: Table, x: string, y: string) {
    const outcome = pairedTTest(source, x, y)
    if (!outcome.ok) throw new Error(`unexpected rejection: ${outcome.error}`)
    return outcome.result
  }

  test("computes the paired statistic from hand-checkable arithmetic", () => {
    const result = run(table, "x", "y")
    expect(result.n).toBe(4)
    expect(result.mean_diff).toBeCloseTo(2.5, 10)
    expect(result.sd_diff).toBeCloseTo(Math.sqrt(5 / 3), 10)
    expect(result.se_diff).toBeCloseTo(Math.sqrt(5 / 3) / 2, 10)
    expect(result.t).toBeCloseTo(3.872983346207417, 9)
    expect(result.df).toBe(3)
    // brackets the t-table anchors for df=3: t=3.182 -> p=0.05, t=4.541 -> p=0.02
    expect(result.p).toBeGreaterThan(0.02)
    expect(result.p).toBeLessThan(0.05)
    expect(result.significant).toBe(true)
    expect(result.direction).toBe("x_y")
  })

  test("flips direction and keeps the same |t| when columns swap", () => {
    const flipped = run(table, "y", "x")
    expect(flipped.t).toBeCloseTo(-3.872983346207417, 9)
    expect(flipped.p).toBeCloseTo(run(table, "x", "y").p, 10)
    expect(flipped.direction).toBe("y_x")
  })

  test("drops rows whose pair is not numeric on both sides", () => {
    expect(run(parseCsv("x,y\n10,9\n20,\n30,27\nnotnum,5"), "x", "y").n).toBe(2)
  })

  test("rejects unknown columns, too-few pairs, and zero variance with readable messages", () => {
    const unknown = pairedTTest(table, "x", "missing")
    expect(unknown).toEqual({ ok: false, error: expect.stringContaining("列不存在") })
    expect(pairedTTest(parseCsv("x,y\n1,0"), "x", "y")).toEqual({ ok: false, error: expect.stringContaining("配对样本不足") })
    expect(pairedTTest(parseCsv("x,y\n1,0\n2,1\n3,2"), "x", "y")).toEqual({ ok: false, error: expect.stringContaining("差值零方差") })
  })

  test("keeps tiny p values readable in logs and latex", () => {
    expect(formatP(0.0305)).toBe("0.0305")
    expect(formatP(1e-9)).toBe("< 1e-4 (1.00e-9)")
    const huge = run(parseCsv("x,y\n100,0\n101,0\n100,0\n101,0\n100,0\n101,0\n100,0\n101,0"), "x", "y")
    expect(huge.t).toBeGreaterThan(500)
    expect(huge.p).toBeGreaterThan(0)
    expect(toLatexTable(huge)).toMatch(/p \(two-sided\) & \d\.\d+e-\d+ /)
  })

  test("renders a LaTeX fragment with the statistic values", () => {
    const latex = toLatexTable(run(table, "x", "y"))
    expect(latex).toContain("\\begin{tabular}{lr}")
    expect(latex).toContain("mean difference & 2.500")
    expect(latex).toContain("t & 3.873")
    expect(latex).toContain("df & 3")
  })
})
