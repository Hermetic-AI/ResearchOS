import { describe, expect, test } from "bun:test"
import {
  type Table,
  formatP,
  pairedTTest,
  parseCsv,
  profile,
  runTest,
  sd,
  studentTwoSidedP,
  tCritical,
  toLatexTable,
  welchTTest,
} from "../src/stats"

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

  // scipy: 2 * stats.t.sf(abs(t), df). Small |t| lands on the complement half of the beta
  // integral (x = df/(df+t^2) above the midpoint), which the t-table anchors never reach.
  test("matches scipy for weak statistics", () => {
    const WEAK: Array<[number, number, number]> = [
      [0.1, 1, 0.936548965138893],
      [0.5, 3, 0.651447964848151],
      [1.0, 10, 0.34089313230206],
      [1.5, 2.5, 0.24783645308629618],
      [0.7, 40, 0.48797877876060175],
      [0.28787658497487356, 5.934605398224744, 0.7832297484525951],
    ]
    for (const [t, df, p] of WEAK) expect(studentTwoSidedP(t, df)).toBeCloseTo(p, 6)
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
    expect(latex).toContain("df & 3.00")
    expect(latex).toContain("Cohen's d_z & 1.936 (large)")
  })

  // scipy: t.interval(0.95, 3, loc=2.5, scale=0.6454972) and mean_diff / sd_diff.
  // The continued-fraction ibeta is accurate to ~1e-8 relative, so tails are compared at that scale.
  test("reports the 95% interval and paired effect size", () => {
    const result = run(table, "x", "y")
    expect(result.p).toBeCloseTo(0.030466291662170977, 7)
    expect(result.ci_low).toBeCloseTo(0.4457397432394794, 5)
    expect(result.ci_high).toBeCloseTo(4.554260256760521, 5)
    expect(result.effect).toBeCloseTo(1.9364916731037085, 9)
    expect(result.effect_kind).toBe("d_z")
    expect(result.effect_label).toBe("large")
    expect(result.significant).toBe(true)
    // The whole interval stays above zero, so loosening alpha to 0.02 un-signals it.
    const strict = pairedTTest(table, "x", "y", 0.02)
    if (!strict.ok) throw new Error("unexpected rejection")
    expect(strict.result.significant).toBe(false)
    expect(strict.result.ci_low).toBeGreaterThan(-1.5)
    expect(strict.result.ci_high).toBeLessThan(6.5)
  })
})

describe("tCritical", () => {
  // scipy: stats.t.ppf(0.975, df) — the same anchors the p-value table is built from.
  const ANCHORS: Array<[number, number]> = [
    [1, 12.706204736174694],
    [2.5, 3.5746548420036817],
    [3, 3.1824463052837078],
    [5, 2.5705818356363146],
    [10, 2.2281388519862744],
    [10.61, 2.210896233588695],
    [30, 2.0422724563012378],
  ]

  test("inverts the two-sided t tail, fractional df included", () => {
    for (const [df, cutoff] of ANCHORS) {
      expect(tCritical(0.05, df)).toBeCloseTo(cutoff, 5)
      expect(studentTwoSidedP(tCritical(0.05, df), df)).toBeCloseTo(0.05, 6)
    }
    expect(tCritical(0.01, 10)).toBeCloseTo(3.169, 3)
  })

  test("grows as alpha shrinks and is NaN for nonsense input", () => {
    expect(tCritical(0.01, 10)).toBeGreaterThan(tCritical(0.05, 10))
    expect(Number.isNaN(tCritical(0.05, 0))).toBe(true)
    expect(Number.isNaN(tCritical(0, 10))).toBe(true)
  })
})

describe("welchTTest", () => {
  // Unequal group sizes and variances; scipy reference values for the same two vectors.
  const csv = "a,b\n43,29\n38,34\n45,32\n48,30\n41,38\n45,31\n,42"
  const table = parseCsv(csv)

  function run(source: Table, x: string, y: string, alpha = 0.05) {
    const outcome = welchTTest(source, x, y, alpha)
    if (!outcome.ok) throw new Error(`unexpected rejection: ${outcome.error}`)
    return outcome.result
  }

  test("matches scipy for independent samples", () => {
    const result = run(table, "a", "b")
    expect(result.method).toBe("welch_t")
    expect([result.n_x, result.n_y, result.n]).toEqual([6, 7, 13])
    expect(result.mean_x).toBeCloseTo(43.333333333333336, 10)
    expect(result.mean_y).toBeCloseTo(33.714285714285715, 10)
    expect(result.sd_x).toBeCloseTo(Math.sqrt(12.266666666666667), 10)
    expect(result.sd_y).toBeCloseTo(Math.sqrt(22.238095238095237), 10)
    expect(result.mean_diff).toBeCloseTo(9.61904761904762, 9)
    expect(result.se_diff).toBeCloseTo(2.285019735744916, 9)
    expect(result.t).toBeCloseTo(4.209612489807145, 9)
    expect(result.df).toBeCloseTo(10.826747728408707, 9)
    expect(result.p).toBeCloseTo(0.0015131687561313143, 9)
    expect(result.ci_low).toBeCloseTo(4.579916579695999, 5)
    expect(result.ci_high).toBeCloseTo(14.658178658399242, 5)
    expect(result.sd_pooled).toBeCloseTo(4.207805568895467, 9)
    expect(result.effect).toBeCloseTo(2.1265125317759095, 9)
    expect(result.effect_kind).toBe("g")
    expect(result.effect_label).toBe("large")
    expect(result.significant).toBe(true)
    expect(result.direction).toBe("x_y")
  })

  test("treats the two columns as independent, so ragged rows are fine", () => {
    // Same values as the paired case but read column-wise: 4 vs 3 observations.
    const ragged = run(parseCsv("a,b\n10,9\n20,18\n30,27\n40,"), "a", "b")
    expect([ragged.n_x, ragged.n_y]).toEqual([4, 3])
    const flipped = run(parseCsv("a,b\n10,9\n20,18\n30,27\n40,"), "b", "a")
    expect(flipped.t).toBeCloseTo(-ragged.t, 10)
    expect(flipped.p).toBeCloseTo(ragged.p, 12)
    expect(flipped.direction).toBe("y_x")
  })

  test("rejects groups with no spread, short groups, and unknown columns", () => {
    const flat = welchTTest(parseCsv("a,b\n1,9\n1,9\n1,9\n1,9"), "a", "b")
    expect(flat).toEqual({ ok: false, error: expect.stringContaining("方差均为 0") })
    expect(welchTTest(table, "a", "nope")).toEqual({ ok: false, error: expect.stringContaining("列不存在") })
    expect(welchTTest(parseCsv("a,b\n1,9\n,8\n,7"), "a", "b")).toEqual({ ok: false, error: expect.stringContaining("至少 2 个有效数值") })
  })

  test("labels effect sizes across the Cohen benchmarks", () => {
    // diff 1.0 with sd_pooled ~ 4.2 gives a small-to-medium g; tweak alpha to keep it significant.
    const result = run(table, "a", "b")
    expect(result.effect / result.sd_pooled).toBeLessThan(1)
    const tiny = run(parseCsv("a,b\n10,9.9\n10.1,10\n10.2,10.1\n10.3,10.2\n10.4,10.3\n10.5,10.4"), "a", "b")
    expect(Math.abs(tiny.effect)).toBeLessThan(0.8)
    expect(["negligible", "small", "medium"]).toContain(tiny.effect_label)
  })
})

describe("runTest", () => {
  const table = parseCsv("a,b\n43,29\n38,34\n45,32\n48,30\n41,38\n45,31\n,42")

  test("dispatches on the requested method", () => {
    const paired = runTest(table, "paired_t", "a", "b")
    const welch = runTest(table, "welch_t", "a", "b")
    if (!paired.ok || !welch.ok) throw new Error("unexpected rejection")
    expect(paired.result.method).toBe("paired_t")
    expect(welch.result.method).toBe("welch_t")
    // Welch ignores the missing pair in the last row; the paired test drops it.
    expect(paired.result.n).toBe(6)
    expect(welch.result.n).toBe(13)
  })

  test("renders a Welch LaTeX fragment with Hedges g and the interval", () => {
    const outcome = runTest(table, "welch_t", "a", "b")
    if (!outcome.ok) throw new Error("unexpected rejection")
    const latex = toLatexTable(outcome.result)
    expect(latex).toContain("% Welch's two-sample t-test: a vs b")
    expect(latex).toContain("n (a / b) & 6 / 7")
    expect(latex).toContain("mean difference & 9.619")
    expect(latex).toContain("df & 10.83")
    expect(latex).toContain("95\\% CI & (4.580, 14.658)")
    expect(latex).toContain("Hedges' g & 2.127 (large)")
  })
})
