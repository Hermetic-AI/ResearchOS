export * as DataAnalyze from "./data-analyze"

import { type Tool } from "@researchos/core-agent"
import { type Db } from "@researchos/core-db"
import { Stats } from "./stats"

// Read-only on purpose: the chat agent may recompute any stored dataset, but writing a result
// into the analysis journal stays an explicit notebook action.
export function dataAnalyzeTool(db: Db, projectId: string): Tool {
  return {
    name: "data_analyze",
    description:
      "Work on datasets saved in the notebook (数据分析页). action=list shows every dataset id and its columns; action=profile shows mean/sd/min/max per column; action=test compares two numeric columns with paired_t / welch_t (t-tests) or wilcoxon / mann_whitney (rank tests) and returns the statistic, p value, CI, effect size and a LaTeX fragment.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "profile", "test"], description: "Operation to run" },
        dataset: { type: "string", description: "Dataset id from action=list; omit to use the newest dataset" },
        x: { type: "string", description: "First numeric column (test)" },
        y: { type: "string", description: "Second numeric column (test)" },
        method: {
          type: "string",
          enum: ["paired_t", "welch_t", "wilcoxon", "mann_whitney"],
          description:
            "paired_t / wilcoxon when rows are the same subject or config, welch_t / mann_whitney for independent groups; rank tests suit ordinal or heavily skewed scores and small samples",
        },
        alpha: { type: "number", description: "Significance level, default 0.05" },
      },
      required: ["action"],
    },
    readOnly: true,
    execute(args) {
      const action = String(args.action ?? "")
      if (action === "list") return { ok: true, output: listOutput(db, projectId) }
      const id = String(args.dataset ?? "")
      const row = ownedDataset(db, projectId, id)
      if (row === null)
        return { ok: false, output: id === "" ? "台账里还没有数据集，请先到数据分析页导入 CSV。" : `没有 id 为「${id}」的数据集，先用 action=list 取一个 id。` }
      const table = Stats.parseCsv(row.csv)
      if (action === "profile") return { ok: true, output: profileOutput(row.name, table) }
      if (action !== "test") return { ok: false, output: `未知 action：${action}（可用 list / profile / test）` }
      const method = Stats.parseMethod(args.method)
      const alpha = typeof args.alpha === "number" && args.alpha > 0 && args.alpha < 1 ? args.alpha : 0.05
      const outcome = Stats.runTest(table, method, String(args.x ?? ""), String(args.y ?? ""), alpha)
      if (!outcome.ok) return { ok: false, output: outcome.error }
      return { ok: true, output: testOutput(row.name, outcome.result, alpha) }
    },
  }
}

function ownedDataset(db: Db, projectId: string, id: string) {
  // An omitted id uses the newest dataset so a one-line chat ask needs no id lookup first.
  const target = id === "" ? db.listDatasets(projectId)[0]?.id : id
  if (target === undefined) return null
  const row = db.getDataset(target)
  if (row === null || row.project_id !== projectId) return null
  return row
}

function listOutput(db: Db, projectId: string): string {
  const rows = db.listDatasets(projectId)
  if (rows.length === 0) return "台账里还没有数据集。请到数据分析页（notebook.html）粘贴 CSV 导入。"
  return [
    `数据集 ${rows.length} 个：`,
    ...rows.map((row) => `- ${row.id} · ${row.name} · ${row.row_count} 行 · 列: ${(JSON.parse(row.columns) as string[]).join(", ")}`),
  ].join("\n")
}

function profileOutput(name: string, table: Stats.Table): string {
  const columns = Stats.profile(table)
  return [
    `${name}：${table.rows.length} 行 × ${table.columns.length} 列`,
    ...columns.map((column) =>
      column.kind === "number"
        ? `- ${column.name}: number n=${column.n} missing=${column.missing} mean=${fmt(column.mean)} sd=${fmt(column.sd)} min=${fmt(column.min)} max=${fmt(column.max)}`
        : `- ${column.name}: text n=${column.n} missing=${column.missing}`,
    ),
    "两列都取数值即可检验：action=test 需要 dataset、x、y，可选 method=paired_t|welch_t|wilcoxon|mann_whitney。",
  ].join("\n")
}

function testOutput(name: string, result: Stats.StatTestResult, alpha: number): string {
  const ci = result.ci_low === null || result.ci_high === null ? "n.a." : `(${fmt(result.ci_low)}, ${fmt(result.ci_high)})`
  return [
    `${name} · ${Stats.testLabel(result)} ${result.x} vs ${result.y}`,
    ...statLines(result, alpha),
    `${Math.round(100 * (1 - alpha))}% CI=${ci} ${result.effect_kind}=${fmt(result.effect)} (${result.effect_label})`,
    "LaTeX：",
    Stats.toLatexTable(result),
    "结果未写入台账；需要在证据链里存档请到数据分析页运行同一检验。",
  ].join("\n")
}

function statLines(result: Stats.StatTestResult, alpha: number): string[] {
  const verdict = `p=${Stats.formatP(result.p)} alpha=${alpha} → ${result.significant ? "显著" : "不显著"}`
  if ("t" in result) {
    const counts = result.method === "welch_t" ? `n_x=${result.n_x} n_y=${result.n_y}` : `pairs=${result.n}`
    return [
      `${counts} t=${fmt(result.t, 4)} df=${fmt(result.df, 2)} ${verdict}`,
      `mean_x=${fmt(result.mean_x)} mean_y=${fmt(result.mean_y)} diff=${fmt(result.mean_diff)} se=${fmt(result.se_diff, 4)}`,
    ]
  }
  const counts =
    result.method === "mann_whitney"
      ? `n_x=${result.n_x} n_y=${result.n_y}`
      : `pairs=${result.n}${result.n_zero > 0 ? `(零差值 ${result.n_zero})` : ""}`
  return [
    `${counts} ${result.statistic_name}=${fmt(result.statistic, 1)} E0=${fmt(result.null_mean, 1)} [${result.p_method}${result.ties ? "·有结" : ""}] ${verdict}`,
    `median_x=${fmt(result.median_x)} median_y=${fmt(result.median_y)} HL=${fmt(result.hl_diff)}`,
  ]
}

function fmt(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return "NA"
  return value.toFixed(digits)
}
