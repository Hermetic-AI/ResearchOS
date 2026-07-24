import type { DataProfile, StatTestResult } from "./types"

export function profileFromCsv(csv: string, fileName: string): DataProfile {
  const lines = csv.trim().split("\n")
  if (lines.length < 2) return { file: fileName, rows: 0, columns: 0, schema: [], stats: {}, anomalies: [] }

  const header = lines[0].split(",").map((h) => h.trim())
  const body = lines.slice(1)
  const stats: DataProfile["stats"] = {}
  const anomalies: DataProfile["anomalies"] = []

  for (const col of header) {
    const values = body.map((l) => {
      const cells = l.split(",")
      return cells[header.indexOf(col)]?.trim() ?? ""
    }).filter(Boolean)
    const numeric = values.map(Number).filter((n) => !isNaN(n))
    stats[col] = {
      count: values.length,
      ...(numeric.length > 0
        ? {
            mean: numeric.reduce((a, b) => a + b, 0) / numeric.length,
            std: Math.sqrt(numeric.reduce((s, n) => s + (n - numeric.reduce((a, b) => a + b, 0) / numeric.length) ** 2, 0) / numeric.length),
            min: Math.min(...numeric),
            max: Math.max(...numeric),
          }
        : {}),
    }
    if (values.length < body.length) {
      anomalies.push({ column: col, row: 0, issue: `${body.length - values.length} missing values` })
    }
  }

  return {
    file: fileName,
    rows: body.length,
    columns: header.length,
    schema: header.map((h) => ({ name: h, type: "string", nullable: true })),
    stats,
    anomalies,
  }
}

export function runStatTest(_test: string, _columns: string[], _data: number[][]): StatTestResult {
  return { test: _test, statistic: 0.05, pValue: 0.95, conclusion: "No significant difference (stub)" }
}

export function linkArtifact(artifactPath: string, commit?: string, texSection?: string): { ok: boolean } {
  return { ok: true }
}
