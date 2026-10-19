import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { Config } from "@researchos/core-config"
import { Db } from "@researchos/core-db"
import { createApp, handleRequest } from "../src/index"

function tempApp() {
  const directory = mkdtempSync(join(tmpdir(), "ros-nb-"))
  const db = Db.open(join(directory, "test.db"))
  const project = db.createProject("p", directory)
  const config = { home: directory, provider: "mock", maxSteps: 8, providers: { mock: { kind: "mock" } } } as Config
  return { app: createApp({ config, db, project }), db }
}

async function call(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const response = await handleRequest(app, new Request(`http://x${path}`, init))
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

// Differences are 1/2/3/4, so t = 3.872983 with df = 3 and 0.02 < p < 0.05.
const CSV = "seed,ddpm,ddim\n1,10,9\n2,20,18\n3,30,27\n4,40,36"

describe("notebook routes", () => {
  test("ingests csv, profiles columns, and traces the import", async () => {
    const { app, db } = tempApp()
    const bad = await call(app, "/api/notebook/datasets", { method: "POST", body: JSON.stringify({ csv: "seed\n" }) })
    expect(bad.status).toBe(400)
    const res = await call(app, "/api/notebook/datasets", {
      method: "POST",
      body: JSON.stringify({ name: "fid.csv", csv: CSV }),
    })
    const dataset = res.body.dataset as { id: string; name: string; row_count: number; columns: string[] }
    expect(res.status).toBe(200)
    expect(dataset.name).toBe("fid.csv")
    expect(dataset.row_count).toBe(4)
    expect(dataset.columns).toEqual(["seed", "ddpm", "ddim"])
    const listed = (await call(app, "/api/notebook/datasets")).body as unknown as Array<Record<string, unknown>>
    expect(listed).toHaveLength(1)
    expect(listed[0]).not.toContainKeys(["csv"])
    expect((await call(app, `/api/notebook/datasets/${dataset.id}`)).body.rows).toHaveLength(4)
    expect(await call(app, "/api/notebook/datasets/ds_missing")).toMatchObject({ status: 404 })
    expect(db.listTrace(app.project.id).some((t) => t.kind === "data" && t.summary.includes("导入数据集 fid.csv"))).toBe(true)
  })

  test("runs a paired t-test, persists the result, and rejects bad input", async () => {
    const { app, db } = tempApp()
    const created = await call(app, "/api/notebook/datasets", { method: "POST", body: JSON.stringify({ name: "fid.csv", csv: CSV }) })
    const id = (created.body.dataset as { id: string }).id
    const missing = await call(app, "/api/notebook/tests", { method: "POST", body: JSON.stringify({ dataset: id, x: "ddpm", y: "nope" }) })
    expect(missing.status).toBe(400)
    expect(String(missing.body.error)).toContain("列不存在")
    expect((await call(app, "/api/notebook/tests", { method: "POST", body: JSON.stringify({ dataset: "ds_gone", x: "a", y: "b" }) })).status).toBe(400)

    const res = await call(app, "/api/notebook/tests", { method: "POST", body: JSON.stringify({ dataset: id, x: "ddpm", y: "ddim" }) })
    const body = res.body as unknown as { result: Record<string, number | boolean>; latex: string }
    expect(res.status).toBe(200)
    expect(body.result.n).toBe(4)
    expect(body.result.df).toBe(3)
    expect(body.result.t as number).toBeCloseTo(3.872983346207417, 9)
    expect(body.result.p as number).toBeGreaterThan(0.02)
    expect(body.result.p as number).toBeLessThan(0.05)
    expect(body.result.significant).toBe(true)
    expect(body.latex).toContain("paired t-test: ddpm vs ddim")
    expect(body.latex).toContain("t & 3.873")

    const results = (await call(app, "/api/notebook/results")).body as unknown as Array<Record<string, unknown>>
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ method: "paired_t", x: "ddpm", y: "ddim", pair_count: 4, significant: true })
    expect((results[0]?.result as Record<string, number>).mean_diff).toBeCloseTo(2.5, 10)
    expect(String(results[0]?.latex)).toContain("\\end{tabular}")
    expect(db.listTrace(app.project.id).some((t) => t.kind === "data" && t.summary.includes("配对 t 检验 ddpm vs ddim"))).toBe(true)
  })

  // scipy: stats.ttest_ind([10,20,30,40],[9,18,27,36], equal_var=False) reads the columns independently.
  test("runs a Welch test on request and traces df plus Hedges g", async () => {
    const { app, db } = tempApp()
    const created = await call(app, "/api/notebook/datasets", { method: "POST", body: JSON.stringify({ name: "fid.csv", csv: CSV }) })
    const id = (created.body.dataset as { id: string }).id
    const res = await call(app, "/api/notebook/tests", { method: "POST", body: JSON.stringify({ dataset: id, x: "ddpm", y: "ddim", method: "welch_t" }) })
    const body = res.body as unknown as { result: Record<string, number | boolean | string>; latex: string }
    const result = body.result
    expect(res.status).toBe(200)
    expect(result.method).toBe("welch_t")
    expect([result.n_x, result.n_y, result.n]).toEqual([4, 4, 8])
    expect(result.t as number).toBeCloseTo(0.28787658497487356, 9)
    expect(result.df as number).toBeCloseTo(5.934605398224744, 6)
    expect(result.p as number).toBeCloseTo(0.7832297484525951, 6)
    expect(result.significant).toBe(false)
    expect(result.ci_low as number).toBeCloseTo(-18.806549133094833, 4)
    expect(result.ci_high as number).toBeCloseTo(23.806549133094833, 4)
    // numpy: sqrt(((nx-1)*var_x + (ny-1)*var_y) / (nx+ny-2)) for the same two vectors.
    expect(result.sd_pooled as number).toBeCloseTo(Math.sqrt(150.83333333333334), 9)
    expect(result.effect as number).toBeCloseTo(0.17700824815700736, 7)
    expect(result.effect_label).toBe("negligible")
    expect(body.latex).toContain("Welch's two-sample t-test")
    expect(body.latex).toContain("n (ddpm / ddim) & 4 / 4")

    const results = (await call(app, "/api/notebook/results")).body as unknown as Array<Record<string, unknown>>
    expect(results[0]).toMatchObject({ method: "welch_t", pair_count: 8, significant: false })
    expect(db.listTrace(app.project.id).some((t) => t.kind === "data" && t.summary.includes("Welch 两独立样本 t 检验 ddpm vs ddim"))).toBe(true)

    // An unrecognized method string falls back to the paired test instead of failing the request.
    const fallback = await call(app, "/api/notebook/tests", { method: "POST", body: JSON.stringify({ dataset: id, x: "ddpm", y: "ddim", method: "chi_square" }) })
    expect((fallback.body as { result: { method: string } }).result.method).toBe("paired_t")
  })

  test("deleting a dataset cascades its results", async () => {
    const { app } = tempApp()
    const created = await call(app, "/api/notebook/datasets", { method: "POST", body: JSON.stringify({ csv: CSV }) })
    const id = (created.body.dataset as { id: string }).id
    await call(app, "/api/notebook/tests", { method: "POST", body: JSON.stringify({ dataset: id, x: "ddpm", y: "ddim" }) })
    expect(((await call(app, "/api/notebook/results")).body as unknown as unknown[])).toHaveLength(1)
    expect((await call(app, `/api/notebook/datasets/${id}`, { method: "DELETE" })).status).toBe(200)
    expect((await call(app, "/api/notebook/results")).body).toHaveLength(0)
    expect((await call(app, `/api/notebook/datasets/${id}`)).status).toBe(404)
  })
})
