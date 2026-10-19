import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { type Config } from "@researchos/core-config"
import { Db } from "@researchos/core-db"
import { createApp } from "../src/index"
import { DataAnalyze } from "../src/data-analyze"

// Differences 1/2/3/4 -> paired t = 3.872983, df 3, p 0.0305.
const CSV = "seed,ddpm,ddim\n1,10,9\n2,20,18\n3,30,27\n4,40,36"

function tempDb() {
  const directory = mkdtempSync(join(tmpdir(), "ros-data-"))
  const db = Db.open(join(directory, "test.db"))
  return { db, project: db.createProject("p", directory) }
}

function seed(db: Db, projectId: string, name = "fid.csv") {
  return db.addDataset(projectId, name, CSV, ["seed", "ddpm", "ddim"], 4).id
}

function run(db: Db, projectId: string, args: Record<string, unknown>) {
  return DataAnalyze.dataAnalyzeTool(db, projectId).execute(args)
}

describe("data_analyze tool", () => {
  test("lists datasets with id, shape and columns", () => {
    const { db, project } = tempDb()
    const id = seed(db, project.id)
    const listed = run(db, project.id, { action: "list" })
    expect(listed.ok).toBe(true)
    expect(listed.output).toContain(id)
    expect(listed.output).toContain("fid.csv · 4 行 · 列: seed, ddpm, ddim")
  })

  test("profiles every column and points at the next call", () => {
    const { db, project } = tempDb()
    const id = seed(db, project.id)
    const out = run(db, project.id, { action: "profile", dataset: id })
    expect(out.output).toContain("fid.csv：4 行 × 3 列")
    expect(out.output).toContain("ddpm: number n=4 missing=0 mean=25.000 sd=12.910 min=10.000 max=40.000")
    expect(out.output).toContain("action=test")
  })

  test("runs the paired test and returns the LaTeX fragment", () => {
    const { db, project } = tempDb()
    const id = seed(db, project.id)
    const out = run(db, project.id, { action: "test", dataset: id, x: "ddpm", y: "ddim" })
    expect(out.output).toContain("配对 t 检验 ddpm vs ddim")
    expect(out.output).toContain("pairs=4 t=3.8730 df=3.00 p=0.0305 alpha=0.05 → 显著")
    expect(out.output).toContain("\\begin{tabular}")
    expect(out.output).toContain("结果未写入台账")
  })

  test("runs Welch on the newest dataset when no id is given", () => {
    const { db, project } = tempDb()
    seed(db, project.id)
    const out = run(db, project.id, { action: "test", method: "welch_t", x: "ddpm", y: "ddim" })
    expect(out.output).toContain("Welch 两独立样本 t 检验 ddpm vs ddim")
    expect(out.output).toContain("n_x=4 n_y=4")
  })

  // scipy: wilcoxon([1,2,3,4]) exact p = 0.125; mannwhitneyu([10,20,30,40], [9,18,27,36]) exact p = 0.685714.
  test("runs the signed-rank test with the exact null distribution", () => {
    const { db, project } = tempDb()
    const id = seed(db, project.id)
    const out = run(db, project.id, { action: "test", dataset: id, x: "ddpm", y: "ddim", method: "wilcoxon" })
    expect(out.output).toContain("Wilcoxon 符号秩检验 ddpm vs ddim")
    expect(out.output).toContain("pairs=4 V=10.0 E0=5.0 [exact] p=0.1250 alpha=0.05 → 不显著")
    expect(out.output).toContain("median_x=25.000 median_y=22.500 HL=2.500")
    expect(out.output).toContain("95% CI=(1.000, 4.000) r=1.000 (large)")
    expect(out.output).toContain("% Wilcoxon signed-rank test: ddpm vs ddim")
    expect(out.output).toContain("rank-biserial r & 1.000")
  })

  test("runs Mann-Whitney on independent columns", () => {
    const { db, project } = tempDb()
    const id = seed(db, project.id)
    const out = run(db, project.id, { action: "test", dataset: id, x: "ddpm", y: "ddim", method: "mann_whitney" })
    expect(out.output).toContain("Mann-Whitney U 秩和检验 ddpm vs ddim")
    expect(out.output).toContain("n_x=4 n_y=4 U=10.0 E0=8.0 [exact] p=0.6857 alpha=0.05 → 不显著")
    expect(out.output).toContain("r=0.250 (small)")
    expect(out.output).toContain("U (ddpm) & 10.0")
  })

  test("answers with readable failures instead of throwing", () => {
    const { db, project } = tempDb()
    const id = seed(db, project.id)
    expect(run(db, "p_other", { action: "profile", dataset: id }).output).toContain("没有 id 为")
    expect(run(db, project.id, { action: "translate" }).output).toContain("未知 action")
    expect(run(db, project.id, { action: "test", dataset: id, x: "ddpm", y: "nope" }).output).toContain("列不存在")
    const fresh = tempDb()
    expect(run(fresh.db, fresh.project.id, { action: "list" }).output).toContain("还没有数据集")
    expect(run(fresh.db, fresh.project.id, { action: "test", x: "a", y: "b" }).output).toContain("台账里还没有数据集")
  })

  test("is registered on the agent tool surface", () => {
    const { db, project } = tempDb()
    const config = { home: project.directory, provider: "mock", maxSteps: 8, providers: { mock: { kind: "mock" } } } as Config
    expect(createApp({ config, db, project }).health().tools).toContain("data_analyze")
  })
})
