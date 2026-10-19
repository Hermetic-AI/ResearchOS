export * as Stats from "./stats"

export interface Table {
  columns: string[]
  rows: Array<Record<string, number | string | null>>
}

export interface ColumnProfile {
  name: string
  kind: "number" | "text"
  n: number
  missing: number
  mean: number | null
  sd: number | null
  min: number | null
  max: number | null
}

export type TestMethod = "paired_t" | "welch_t" | "wilcoxon" | "mann_whitney"
export type EffectKind = "d_z" | "g" | "r"
export type EffectLabel = "negligible" | "small" | "medium" | "large"
// exact = enumerated null distribution, normal = tie-corrected gaussian approximation.
export type ApproxMethod = "exact" | "normal"

interface TestBase {
  x: string
  y: string
  alpha: number
  n: number
  mean_x: number
  mean_y: number
  mean_diff: number
  se_diff: number
  t: number
  df: number
  p: number
  significant: boolean
  direction: "x_y" | "y_x" | "flat"
  ci_low: number
  ci_high: number
  effect: number
  effect_kind: EffectKind
  effect_label: EffectLabel
}

export interface PairedTestResult extends TestBase {
  method: "paired_t"
  sd_diff: number
}

export interface WelchTestResult extends TestBase {
  method: "welch_t"
  n_x: number
  n_y: number
  sd_x: number
  sd_y: number
  sd_pooled: number
}

// Rank tests carry no t/df/SE, so they share this base instead of TestBase.
interface RankBase {
  x: string
  y: string
  alpha: number
  n: number
  mean_x: number
  mean_y: number
  median_x: number
  median_y: number
  statistic: number
  statistic_name: "V" | "U"
  null_mean: number
  p: number
  p_method: ApproxMethod
  significant: boolean
  direction: "x_y" | "y_x" | "flat"
  hl_diff: number
  ci_low: number | null
  ci_high: number | null
  ci_method: ApproxMethod
  ties: boolean
  effect: number
  effect_kind: "r"
  effect_label: EffectLabel
}

export interface WilcoxonTestResult extends RankBase {
  method: "wilcoxon"
  n_zero: number
  median_diff: number
}

export interface MannWhitneyTestResult extends RankBase {
  method: "mann_whitney"
  n_x: number
  n_y: number
  mean_rank_x: number
  mean_rank_y: number
}

export type StatTestResult = PairedTestResult | WelchTestResult | WilcoxonTestResult | MannWhitneyTestResult

const TEST_METHODS: Array<TestMethod> = ["paired_t", "welch_t", "wilcoxon", "mann_whitney"]

// Anything unrecognised falls back to the paired t-test, the page's default.
export function parseMethod(raw: unknown): TestMethod {
  return TEST_METHODS.find((method) => method === raw) ?? "paired_t"
}

const parseCell = (raw: string): number | string | null => {
  const value = raw.trim()
  if (value === "") return null
  const num = Number(value)
  return Number.isFinite(num) ? num : value
}

export function parseCsv(text: string): Table {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "")
  if (lines.length === 0) return { columns: [], rows: [] }
  const columns = (lines[0] ?? "").split(",").map((name, i) => name.trim() === "" ? `col${i + 1}` : name.trim())
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",")
    const row: Record<string, number | string | null> = {}
    columns.forEach((name, i) => {
      row[name] = parseCell(cells[i] ?? "")
    })
    return row
  })
  return { columns, rows }
}

export function numericColumn(table: Table, name: string): number[] {
  if (!table.columns.includes(name)) return []
  return table.rows.map((row) => row[name]).filter((value): value is number => typeof value === "number")
}

export function pairedNumbers(table: Table, x: string, y: string): Array<{ x: number; y: number }> {
  return table.rows
    .map((row) => ({ x: row[x], y: row[y] }))
    .filter((pair): pair is { x: number; y: number } => typeof pair.x === "number" && typeof pair.y === "number")
}

export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

// Sample standard deviation (n - 1); undefined for a single value, which has no spread to report.
export function sd(values: number[]): number | undefined {
  if (values.length < 2) return undefined
  const m = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1))
}

export function describe(table: Table, name: string): ColumnProfile {
  const cells = table.rows.map((row) => row[name])
  const numbers = cells.filter((cell): cell is number => typeof cell === "number")
  const missing = cells.filter((cell) => cell === null || cell === "").length
  const kind: ColumnProfile["kind"] = numbers.length === cells.length - missing && numbers.length > 0 ? "number" : "text"
  const spread = sd(numbers)
  return {
    name,
    kind,
    n: numbers.length,
    missing,
    mean: numbers.length === 0 ? null : mean(numbers),
    sd: numbers.length === 0 ? null : spread ?? null,
    min: numbers.length === 0 ? null : Math.min(...numbers),
    max: numbers.length === 0 ? null : Math.max(...numbers),
  }
}

export function profile(table: Table): ColumnProfile[] {
  return table.columns.map((name) => describe(table, name))
}

// Lanczos approximation with g = 7, accurate to ~15 significant digits for x >= 0.5 — every
// argument the beta and gamma tails below pass in. The 6-term Numerical Recipes variant is only
// good to ~3e-7 absolute near x = 0.5, which showed up as a 3.6e-7 relative error in the normal
// tail the tie-corrected rank p values depend on.
const LANCZOS: Array<number> = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

function logGamma(x: number): number {
  const z = x - 1
  let sum = LANCZOS[0] ?? 0
  for (let i = 1; i < LANCZOS.length; i++) sum += (LANCZOS[i] ?? 0) / (z + i)
  const t = LANCZOS.length - 2 + 0.5 + z
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum)
}

const TINY = 1e-300
const EPSILON = 3e-12

function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < EPSILON) break
  }
  return h
}

// Regularized incomplete beta I_x(a, b).
function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lnFront = a * Math.log(x) + b * Math.log(1 - x) - logGamma(a) - logGamma(b) + logGamma(a + b)
  const front = Math.exp(lnFront)
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a
  // I_x(a, b) = 1 - I_{1-x}(b, a). B(a, b) is symmetric, so the same front term serves the tail half.
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

// Generic so a caller that already knows the method keeps the method-only fields (sd_diff vs sd_pooled).
export type StatOutcome<T extends StatTestResult = StatTestResult> = { ok: true; result: T } | { ok: false; error: string }

// Keeps tiny p values readable instead of rounding them to 0.0000 in logs and notes.
export function formatP(p: number): string {
  if (p < 1e-4) return `< 1e-4 (${p.toExponential(2)})`
  return p.toFixed(4)
}

// Shared one-line naming for trace summaries and the data_analyze tool.
export function testLabel(result: StatTestResult): string {
  if (result.method === "welch_t") return "Welch 两独立样本 t 检验"
  if (result.method === "wilcoxon") return "Wilcoxon 符号秩检验"
  if (result.method === "mann_whitney") return "Mann-Whitney U 秩和检验"
  return "配对 t 检验"
}

// t-tests report t and df; rank tests report V/U plus how the p value was obtained.
export function statisticSummary(result: StatTestResult): string {
  if ("t" in result) return `t=${result.t.toFixed(3)} · df=${result.df.toFixed(2)}`
  return `${result.statistic_name}=${result.statistic.toFixed(1)} · ${result.p_method}${result.ties ? "·有结" : ""}`
}

export function effectSummary(result: StatTestResult): string {
  return `${result.effect_kind}=${result.effect.toFixed(3)} ${result.effect_label}`
}

// Two-sided p-value for Student's t with df degrees of freedom: p = I_{df/(df+t^2)}(df/2, 1/2).
export function studentTwoSidedP(t: number, df: number): number {
  if (!(df > 0) || !Number.isFinite(t)) return Number.NaN
  return ibeta(df / (df + t * t), df / 2, 0.5)
}

// Two-sided critical value: t such that studentTwoSidedP(t, df) === alpha, i.e. scipy's
// t.ppf(1 - alpha/2, df). p falls monotonically in t, so invert by bisection.
export function tCritical(alpha: number, df: number): number {
  if (!(df > 0) || !(alpha > 0) || !(alpha < 1)) return Number.NaN
  let lo = 0
  let hi = 1e6
  for (let step = 0; step < 100; step++) {
    const mid = (lo + hi) / 2
    if (studentTwoSidedP(mid, df) > alpha) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// Cohen's benchmarks; the same cut-offs read sensibly for d_z and Hedges' g.
function effectLabel(effect: number): EffectLabel {
  const size = Math.abs(effect)
  if (size < 0.2) return "negligible"
  if (size < 0.5) return "small"
  if (size < 0.8) return "medium"
  return "large"
}

function directionOf(meanDiff: number): StatTestResult["direction"] {
  if (meanDiff === 0) return "flat"
  return meanDiff > 0 ? "x_y" : "y_x"
}

function requireColumns(table: Table, names: string[]): string | null {
  const missing = names.filter((name) => !table.columns.includes(name))
  if (missing.length === 0) return null
  return `列不存在：${missing.join("、")}。可选列：${table.columns.join(", ")}`
}

export function pairedTTest(table: Table, x: string, y: string, alpha = 0.05): StatOutcome<PairedTestResult> {
  const missing = requireColumns(table, [x, y])
  if (missing) return { ok: false, error: missing }
  const pairs = pairedNumbers(table, x, y)
  const n = pairs.length
  if (n < 2) return { ok: false, error: `配对样本不足：${x} 与 ${y} 只有 ${n} 对有效数值，至少需要 2 对` }
  const diffs = pairs.map((pair) => pair.x - pair.y)
  const meanDiff = mean(diffs)
  const sdDiff = sd(diffs) ?? 0
  const seDiff = sdDiff / Math.sqrt(n)
  if (seDiff === 0) return { ok: false, error: "差值零方差，t 统计量无定义；请检查是否每对数据相同" }
  const t = meanDiff / seDiff
  const df = n - 1
  const p = studentTwoSidedP(t, df)
  const cutoff = tCritical(alpha, df)
  return {
    ok: true,
    result: {
      method: "paired_t",
      n,
      x,
      y,
      mean_x: mean(pairs.map((pair) => pair.x)),
      mean_y: mean(pairs.map((pair) => pair.y)),
      mean_diff: meanDiff,
      sd_diff: sdDiff,
      se_diff: seDiff,
      t,
      df,
      p,
      alpha,
      significant: p < alpha,
      direction: directionOf(meanDiff),
      ci_low: meanDiff - cutoff * seDiff,
      ci_high: meanDiff + cutoff * seDiff,
      effect: meanDiff / sdDiff,
      effect_kind: "d_z",
      effect_label: effectLabel(meanDiff / sdDiff),
    },
  }
}

// Welch's t-test compares two independent columns; rows need not pair up, and the unequal
// variances mean the degrees of freedom come out fractional.
export function welchTTest(table: Table, x: string, y: string, alpha = 0.05): StatOutcome<WelchTestResult> {
  const missing = requireColumns(table, [x, y])
  if (missing) return { ok: false, error: missing }
  const xs = numericColumn(table, x)
  const ys = numericColumn(table, y)
  if (xs.length < 2 || ys.length < 2)
    return { ok: false, error: `两组各需至少 2 个有效数值：${x} 有 ${xs.length} 个，${y} 有 ${ys.length} 个` }
  const meanX = mean(xs)
  const meanY = mean(ys)
  const varX = (sd(xs) ?? 0) ** 2
  const varY = (sd(ys) ?? 0) ** 2
  const se = Math.sqrt(varX / xs.length + varY / ys.length)
  if (se === 0) return { ok: false, error: "两组方差均为 0，t 统计量无定义；每组内取值完全相同" }
  const meanDiff = meanX - meanY
  const t = meanDiff / se
  const df = (varX / xs.length + varY / ys.length) ** 2 / ((varX / xs.length) ** 2 / (xs.length - 1) + (varY / ys.length) ** 2 / (ys.length - 1))
  const p = studentTwoSidedP(t, df)
  const cutoff = tCritical(alpha, df)
  const sdPooled = Math.sqrt(((xs.length - 1) * varX + (ys.length - 1) * varY) / (xs.length + ys.length - 2))
  // Hedges' g is Cohen's d with the small-sample correction J.
  const g = (meanDiff / sdPooled) * (1 - 3 / (4 * (xs.length + ys.length - 2) - 1))
  return {
    ok: true,
    result: {
      method: "welch_t",
      n: xs.length + ys.length,
      n_x: xs.length,
      n_y: ys.length,
      x,
      y,
      mean_x: meanX,
      mean_y: meanY,
      sd_x: sd(xs) ?? 0,
      sd_y: sd(ys) ?? 0,
      sd_pooled: sdPooled,
      mean_diff: meanDiff,
      se_diff: se,
      t,
      df,
      p,
      alpha,
      significant: p < alpha,
      direction: directionOf(meanDiff),
      ci_low: meanDiff - cutoff * se,
      ci_high: meanDiff + cutoff * se,
      effect: g,
      effect_kind: "g",
      effect_label: effectLabel(g),
    },
  }
}

// ---- non-parametric rank tests ----

// 2^50 is still an exact double, so subset-sum counts stay integral up to n = 50; past that the
// normal approximation is the standard choice anyway.
const MAX_EXACT_RANK_N = 50
const MAX_EXACT_U_CELLS = 4096
// Walsh and pairwise-difference arrays are sorted for the CI; beyond this the interval is skipped.
const MAX_CI_CELLS = 20000

function medianSorted(sorted: number[]): number {
  const mid = sorted.length >> 1
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function median(values: number[]): number {
  return medianSorted([...values].sort((a, b) => a - b))
}

function tieGroupSizes(values: number[]): number[] {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.values()]
}

function hasTies(values: number[]): boolean {
  return values.length > 0 && tieGroupSizes(values).length !== values.length
}

// Average ranks over tied runs (midranks), the convention every rank test below relies on.
function midranks(values: number[]): number[] {
  const groups = new Map<number, number[]>()
  values.forEach((value, index) => {
    const members = groups.get(value)
    if (members === undefined) groups.set(value, [index])
    else members.push(index)
  })
  const ranks: number[] = new Array(values.length).fill(0)
  let position = 0
  for (const value of [...groups.keys()].sort((a, b) => a - b)) {
    const members = groups.get(value) ?? []
    const rank = position + (members.length + 1) / 2
    for (const index of members) ranks[index] = rank
    position += members.length
  }
  return ranks
}

function binomial(n: number, k: number): number {
  let out = 1
  for (let i = 1; i <= k; i++) out = (out * (n - k + i)) / i
  return out
}

// Subset-sum DP over ranks 1..n: the exact null distribution of the signed-rank sum V.
function subsetSumCounts(weights: number[]): Map<number, number> {
  let counts = new Map<number, number>([[0, 1]])
  for (const weight of weights) {
    const next = new Map(counts)
    for (const [sum, ways] of counts) next.set(sum + weight, (next.get(sum + weight) ?? 0) + ways)
    counts = next
  }
  return counts
}

// Gaussian-binomial DP: the exact null distribution of U for two untied samples.
function mannWhitneyCounts(n1: number, n2: number): Map<number, number> {
  const memo = new Map<string, Map<number, number>>()
  function solve(a: number, b: number): Map<number, number> {
    const key = `${a}:${b}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    const out = new Map<number, number>()
    if (a === 0 && b === 0) out.set(0, 1)
    // The largest remaining observation is an x, which beats all b y's, or a y, which beats none.
    if (a > 0)
      for (const [sum, ways] of solve(a - 1, b)) out.set(sum + b, (out.get(sum + b) ?? 0) + ways)
    if (b > 0) for (const [sum, ways] of solve(a, b - 1)) out.set(sum, (out.get(sum) ?? 0) + ways)
    memo.set(key, out)
    return out
  }
  return solve(n1, n2)
}

function twoSidedFromCounts(counts: Map<number, number>, total: number, statistic: number): number {
  let lower = 0
  let upper = 0
  for (const [value, ways] of counts) {
    if (value <= statistic) lower += ways
    if (value >= statistic) upper += ways
  }
  return Math.min(1, (2 * Math.min(lower, upper)) / total)
}

// Smallest j with P(stat <= j) >= prob, i.e. R's qsignrank / qwilcox inverse.
function exactLowerQuantile(counts: Map<number, number>, total: number, prob: number): number {
  const values = [...counts.keys()].sort((a, b) => a - b)
  let cumulative = 0
  for (const value of values) {
    cumulative += counts.get(value) ?? 0
    if (cumulative / total >= prob) return value
  }
  return values[values.length - 1] ?? 0
}

const FPMIN = 1e-30

// Regularized lower incomplete gamma P(a, x) series (Numerical Recipes 6.2.1).
function gammaSeries(a: number, x: number): number {
  let sum = 1 / a
  let term = sum
  for (let n = 1; n <= 300; n++) {
    term *= x / (a + n)
    sum += term
    if (Math.abs(term) < Math.abs(sum) * EPSILON) break
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
}

// Regularized upper incomplete gamma Q(a, x) continued fraction (Numerical Recipes 6.2.5).
function gammaFraction(a: number, x: number): number {
  let b = x + 1 - a
  let c = 1 / FPMIN
  let d = 1 / b
  let h = d
  for (let i = 1; i <= 300; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = b + an / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < EPSILON) break
  }
  return h * Math.exp(-x + a * Math.log(x) - logGamma(a))
}

// erfc(z) = Q(1/2, z^2), so the two-sided normal tail at z is Q(1/2, z^2 / 2).
function erfc(z: number): number {
  if (z === 0) return 1
  const x = z * z
  const a = 0.5
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaFraction(a, x)
}

function normalTwoSidedZ(z: number): number {
  if (!Number.isFinite(z)) return Number.NaN
  return erfc(Math.abs(z) / Math.SQRT2)
}

// Continuity-corrected two-sided p for a rank statistic (R's `correct = TRUE`, scipy's
// `correction = True` / `use_continuity = True`).
function normalRankP(statistic: number, mu: number, sigma: number): number {
  const z = (Math.abs(statistic - mu) - 0.5) / sigma
  if (z <= 0) return 1
  return normalTwoSidedZ(z)
}

// z whose TWO-sided normal tail equals prob; monotone in z, so bisect like tCritical. A CI needs
// the one-sided α/2 point, which is this function evaluated at prob = α.
function normalCritical(prob: number): number {
  let lo = 0
  let hi = 40
  for (let step = 0; step < 100; step++) {
    const mid = (lo + hi) / 2
    if (normalTwoSidedZ(mid) > prob) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// Walsh averages (d_i + d_j)/2 for i <= j; their median is the Hodges-Lehmann paired shift.
function sortedWalsh(values: number[]): number[] {
  const out: number[] = []
  values.forEach((left, i) => {
    values.slice(i).forEach((right) => out.push((left + right) / 2))
  })
  return out.sort((a, b) => a - b)
}

function sortedPairwiseDifferences(xs: number[], ys: number[]): number[] {
  const out: number[] = []
  for (const x of xs) for (const y of ys) out.push(x - y)
  return out.sort((a, b) => a - b)
}

// Order-statistic CI for the shift: [sorted[k], sorted[M-1-k]] with k from the null distribution.
function intervalFrom(sorted: number[], k: number): { low: number; high: number } | null {
  if (sorted.length === 0) return null
  const lower = Math.min(Math.max(k, 0), sorted.length - 1)
  const upper = Math.min(Math.max(sorted.length - 1 - k, 0), sorted.length - 1)
  return { low: sorted[lower] ?? 0, high: sorted[upper] ?? 0 }
}

// Rank-biserial benchmarks, not the d_z / g cut-offs in effectLabel.
function rankEffectLabel(effect: number): EffectLabel {
  const size = Math.abs(effect)
  if (size < 0.1) return "negligible"
  if (size < 0.3) return "small"
  if (size < 0.5) return "medium"
  return "large"
}

export function wilcoxonSignedRank(table: Table, x: string, y: string, alpha = 0.05): StatOutcome<WilcoxonTestResult> {
  const missing = requireColumns(table, [x, y])
  if (missing) return { ok: false, error: missing }
  const pairs = pairedNumbers(table, x, y)
  if (pairs.length < 2)
    return { ok: false, error: `配对样本不足：${x} 与 ${y} 只有 ${pairs.length} 对有效数值，至少需要 2 对` }
  const diffs = pairs.map((pair) => pair.x - pair.y)
  // Zero differences are dropped (R's and scipy's default), so n can be below the pair count.
  const nonzero = diffs.filter((diff) => diff !== 0)
  const n = nonzero.length
  if (n < 2) return { ok: false, error: `去掉 ${diffs.length - n} 对零差值后只剩 ${n} 对，符号秩检验无法进行` }
  const absDiffs = nonzero.map((diff) => Math.abs(diff))
  const ranks = midranks(absDiffs)
  const V = ranks.reduce((sum, rank, i) => ((nonzero[i] ?? 0) > 0 ? sum + rank : sum), 0)
  const nullMean = (n * (n + 1)) / 4
  const sd = Math.sqrt(ranks.reduce((sum, rank) => sum + rank * rank, 0) / 4)
  const ties = hasTies(absDiffs)
  const counts = !ties && n <= MAX_EXACT_RANK_N ? subsetSumCounts(Array.from({ length: n }, (_, i) => i + 1)) : null
  const total = 2 ** n
  const p = counts === null ? normalRankP(V, nullMean, sd) : twoSidedFromCounts(counts, total, V)
  const walsh = sortedWalsh(nonzero)
  const k = counts === null
    ? Math.round(nullMean - normalCritical(alpha) * sd)
    : exactLowerQuantile(counts, total, alpha / 2)
  const interval = walsh.length <= MAX_CI_CELLS ? intervalFrom(walsh, k) : null
  const hl = medianSorted(walsh)
  // Reported as V = sum of ranks of the positive differences (R's convention); scipy prints
  // min(V, n(n+1)/2 - V) for a two-sided alternative. V/Σranks is the proportion of favourable
  // evidence, so the rank-biserial r = 2V/Σranks - 1 = 4V/(n(n+1)) - 1 spans -1..1.
  const effect = (4 * V) / (n * (n + 1)) - 1
  return {
    ok: true,
    result: {
      method: "wilcoxon",
      n,
      n_zero: diffs.length - n,
      x,
      y,
      mean_x: mean(pairs.map((pair) => pair.x)),
      mean_y: mean(pairs.map((pair) => pair.y)),
      median_x: median(pairs.map((pair) => pair.x)),
      median_y: median(pairs.map((pair) => pair.y)),
      median_diff: median(diffs),
      statistic: V,
      statistic_name: "V",
      null_mean: nullMean,
      p,
      p_method: counts === null ? "normal" : "exact",
      alpha,
      significant: p < alpha,
      direction: directionOf(hl),
      hl_diff: hl,
      ci_low: interval?.low ?? null,
      ci_high: interval?.high ?? null,
      ci_method: counts === null ? "normal" : "exact",
      ties,
      effect,
      effect_kind: "r",
      effect_label: rankEffectLabel(effect),
    },
  }
}

export function mannWhitneyU(table: Table, x: string, y: string, alpha = 0.05): StatOutcome<MannWhitneyTestResult> {
  const missing = requireColumns(table, [x, y])
  if (missing) return { ok: false, error: missing }
  const xs = numericColumn(table, x)
  const ys = numericColumn(table, y)
  if (xs.length < 2 || ys.length < 2)
    return { ok: false, error: `两组各需至少 2 个有效数值：${x} 有 ${xs.length} 个，${y} 有 ${ys.length} 个` }
  const n1 = xs.length
  const n2 = ys.length
  const combined = [...xs, ...ys]
  // U counts how often an x beats a y, with half credit for ties.
  const U = xs.reduce((sum, xValue) => sum + ys.reduce((inner, yValue) => inner + (xValue > yValue ? 1 : xValue === yValue ? 0.5 : 0), 0), 0)
  const ranks = midranks(combined)
  const rankSumX = ranks.slice(0, n1).reduce((sum, rank) => sum + rank, 0)
  const nullMean = (n1 * n2) / 2
  const N = n1 + n2
  const tieTerm = tieGroupSizes(combined).reduce((sum, size) => sum + (size ** 3 - size), 0)
  const sd = Math.sqrt(((n1 * n2) / 12) * ((N + 1) - tieTerm / (N * (N - 1))))
  const arrangements = binomial(N, n1)
  const ties = hasTies(combined)
  const counts = !ties && n1 * n2 <= MAX_EXACT_U_CELLS && Number.isSafeInteger(arrangements) ? mannWhitneyCounts(n1, n2) : null
  const p = counts === null ? normalRankP(U, nullMean, sd) : twoSidedFromCounts(counts, arrangements, U)
  const diffs = sortedPairwiseDifferences(xs, ys)
  const k = counts === null
    ? Math.round(nullMean - normalCritical(alpha) * sd)
    : exactLowerQuantile(counts, arrangements, alpha / 2)
  const interval = diffs.length <= MAX_CI_CELLS ? intervalFrom(diffs, k) : null
  const hl = medianSorted(diffs)
  const effect = (2 * U) / (n1 * n2) - 1
  return {
    ok: true,
    result: {
      method: "mann_whitney",
      n: N,
      n_x: n1,
      n_y: n2,
      x,
      y,
      mean_x: mean(xs),
      mean_y: mean(ys),
      median_x: median(xs),
      median_y: median(ys),
      mean_rank_x: rankSumX / n1,
      mean_rank_y: (ranks.reduce((sum, rank) => sum + rank, 0) - rankSumX) / n2,
      statistic: U,
      statistic_name: "U",
      null_mean: nullMean,
      p,
      p_method: counts === null ? "normal" : "exact",
      alpha,
      significant: p < alpha,
      direction: directionOf(hl),
      hl_diff: hl,
      ci_low: interval?.low ?? null,
      ci_high: interval?.high ?? null,
      ci_method: counts === null ? "normal" : "exact",
      ties,
      effect,
      effect_kind: "r",
      effect_label: rankEffectLabel(effect),
    },
  }
}

export function runTest(table: Table, method: TestMethod, x: string, y: string, alpha = 0.05): StatOutcome {
  if (method === "welch_t") return welchTTest(table, x, y, alpha)
  if (method === "wilcoxon") return wilcoxonSignedRank(table, x, y, alpha)
  if (method === "mann_whitney") return mannWhitneyU(table, x, y, alpha)
  return pairedTTest(table, x, y, alpha)
}

// Plain-text LaTeX body so the analyst can paste results into experiments.tex.
const METHOD_LABEL: Record<TestMethod, string> = {
  paired_t: "paired t-test",
  welch_t: "Welch's two-sample t-test",
  wilcoxon: "Wilcoxon signed-rank test",
  mann_whitney: "Mann-Whitney U test",
}

export function toLatexTable(result: StatTestResult): string {
  const fmt = (value: number, digits = 3) => value.toFixed(digits)
  const p = result.p < 1e-4 ? result.p.toExponential(2) : fmt(result.p, 4)
  const level = `${fmt(100 * (1 - result.alpha), 0)}\\%`
  const ci = result.ci_low === null || result.ci_high === null ? "n.a." : `(${fmt(result.ci_low, 3)}, ${fmt(result.ci_high, 3)})`
  const effectName = result.effect_kind === "d_z" ? "Cohen's d_z" : result.effect_kind === "g" ? "Hedges' g" : "rank-biserial r"
  const rank = "hl_diff" in result
  return [
    `% ${METHOD_LABEL[result.method]}: ${result.x} vs ${result.y}`,
    "\\begin{tabular}{lr}",
    "\\toprule",
    "Statistic & Value \\\\",
    "\\midrule",
    ...(rank ? rankRows(result, fmt) : tRows(result, fmt)),
    `${rank ? "p (two-sided, " + result.p_method + ")" : "p (two-sided)"} & ${p} \\\\`,
    `${level} ${rank ? "CI (HL shift)" : "CI"} & ${ci} \\\\`,
    `${effectName} & ${fmt(result.effect, 3)} (${result.effect_label}) \\\\`,
    "\\bottomrule",
    "\\end{tabular}",
  ].join("\n")
}

function tRows(result: PairedTestResult | WelchTestResult, fmt: (value: number, digits?: number) => string): string[] {
  const tail = [
    `mean difference & ${fmt(result.mean_diff, 3)} \\\\`,
    `SE of difference & ${fmt(result.se_diff, 3)} \\\\`,
    `t & ${fmt(result.t, 3)} \\\\`,
    `df & ${fmt(result.df, 2)} \\\\`,
  ]
  if (result.method === "welch_t")
    return [
      `n (${result.x} / ${result.y}) & ${result.n_x} / ${result.n_y} \\\\`,
      `mean(${result.x}) & ${fmt(result.mean_x, 2)} ± ${fmt(result.sd_x, 2)} \\\\`,
      `mean(${result.y}) & ${fmt(result.mean_y, 2)} ± ${fmt(result.sd_y, 2)} \\\\`,
      ...tail,
    ]
  return [
    `n (pairs) & ${result.n} \\\\`,
    `mean(${result.x}) & ${fmt(result.mean_x, 2)} \\\\`,
    `mean(${result.y}) & ${fmt(result.mean_y, 2)} \\\\`,
    ...tail,
  ]
}

function rankRows(
  result: WilcoxonTestResult | MannWhitneyTestResult,
  fmt: (value: number, digits?: number) => string,
): string[] {
  const head = [
    `median (${result.x} / ${result.y}) & ${fmt(result.median_x, 2)} / ${fmt(result.median_y, 2)} \\\\`,
    `${result.statistic_name} (${result.x}) & ${fmt(result.statistic, 1)} \\\\`,
    `E[${result.statistic_name}] under H0 & ${fmt(result.null_mean, 1)} \\\\`,
    `Hodges-Lehmann shift & ${fmt(result.hl_diff, 3)} \\\\`,
    `ties & ${result.ties ? "yes (midranks)" : "no"} \\\\`,
  ]
  if (result.method === "mann_whitney")
    return [
      `n (${result.x} / ${result.y}) & ${result.n_x} / ${result.n_y} \\\\`,
      `mean rank (${result.x} / ${result.y}) & ${fmt(result.mean_rank_x, 2)} / ${fmt(result.mean_rank_y, 2)} \\\\`,
      ...head,
    ]
  return [`n (pairs, non-zero) & ${result.n} \\\\`, `zero differences & ${result.n_zero} \\\\`, ...head]
}
