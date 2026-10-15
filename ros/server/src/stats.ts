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

export interface StatTestResult {
  method: "paired_t"
  n: number
  x: string
  y: string
  mean_x: number
  mean_y: number
  mean_diff: number
  sd_diff: number
  se_diff: number
  t: number
  df: number
  p: number
  alpha: number
  significant: boolean
  direction: "x_y" | "y_x" | "flat"
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

function logGamma(x: number): number {
  const coef = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-4]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.000000000190015
  for (const c of coef) {
    y += 1
    ser += c / y
  }
  return Math.log((2.5066282746310005 * ser) / x) - tmp
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
  return 1 - (Math.exp(a * Math.log(1 - x) + b * Math.log(x) - logGamma(a) - logGamma(b) + logGamma(a + b)) * betaContinuedFraction(b, a, 1 - x)) / b
}

// Two-sided p-value for Student's t with df degrees of freedom: p = I_{df/(df+t^2)}(df/2, 1/2).
export type StatOutcome = { ok: true; result: StatTestResult } | { ok: false; error: string }

// Keeps tiny p values readable instead of rounding them to 0.0000 in logs and notes.
export function formatP(p: number): string {
  if (p < 1e-4) return `< 1e-4 (${p.toExponential(2)})`
  return p.toFixed(4)
}

export function studentTwoSidedP(t: number, df: number): number {
  if (!(df > 0) || !Number.isFinite(t)) return Number.NaN
  return ibeta(df / (df + t * t), df / 2, 0.5)
}

export function pairedTTest(table: Table, x: string, y: string, alpha = 0.05): StatOutcome {
  const missing = [x, y].filter((name) => !table.columns.includes(name))
  if (missing.length > 0) return { ok: false, error: `列不存在：${missing.join("、")}。可选列：${table.columns.join(", ")}` }
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
      direction: meanDiff === 0 ? "flat" : meanDiff > 0 ? "x_y" : "y_x",
    },
  }
}

// Plain-text LaTeX body so the analyst can paste results into experiments.tex.
export function toLatexTable(result: StatTestResult): string {
  const fmt = (value: number, digits = 3) => value.toFixed(digits)
  const p = result.p < 1e-4 ? result.p.toExponential(2) : fmt(result.p, 4)
  return [
    "% paired t-test: " + result.x + " vs " + result.y,
    "\\begin{tabular}{lr}",
    "\\toprule",
    "Statistic & Value \\\\",
    "\\midrule",
    `n (pairs) & ${result.n} \\\\`,
    `mean(${result.x}) & ${fmt(result.mean_x, 2)} \\\\`,
    `mean(${result.y}) & ${fmt(result.mean_y, 2)} \\\\`,
    `mean difference & ${fmt(result.mean_diff, 3)} \\\\`,
    `SD of differences & ${fmt(result.sd_diff, 3)} \\\\`,
    `t & ${fmt(result.t, 3)} \\\\`,
    `df & ${result.df} \\\\`,
    `p (two-sided) & ${p} \\\\`,
    "\\bottomrule",
    "\\end{tabular}",
  ].join("\n")
}
