import { afterAll, describe, test, expect } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { pathToFileURL } from "url"
import { ReproduceStore } from "../src/store"
import { advanceRun } from "../src/runner"
import { createPipeline, parseDependencies, diagnose, compareResults } from "../src/pipeline"

describe("createPipeline", () => {
  test("creates a pipeline with 6 steps", () => {
    const run = createPipeline("https://arxiv.org/abs/1706.03762", "https://github.com/example/repo")
    expect(run.steps.length).toBe(6)
    expect(run.steps.map((s) => s.step)).toEqual(["clone", "analyze", "detect", "env", "run", "compare"])
    expect(run.steps.every((s) => s.status === "pending")).toBe(true)
  })
})

describe("parseDependencies", () => {
  test("parses requirements.txt", () => {
    const reqs = "numpy==1.24.0\npandas>=2.0\n# comment\nscipy"
    const deps = parseDependencies(reqs)
    expect(deps["numpy"]).toBe("1.24.0")
    expect(deps["scipy"]).toBe("*")
  })
})

describe("diagnose", () => {
  test("detects unpinned dependencies", () => {
    const reqs = "torch\nnumpy==1.24.0"
    const report = diagnose(reqs, "3.10", false)
    expect(report.dependencies.some((d) => d.name === "torch")).toBe(true)
    expect(report.dependencies.length).toBeGreaterThan(0)
  })

  test("detects missing CUDA for ML frameworks", () => {
    const report = diagnose("torch==2.0", "3.10", false)
    expect(report.dependencies.some((d) => d.name === "CUDA")).toBe(true)
  })
})

describe("compareResults", () => {
  test("detects matching and mismatching metrics", () => {
    const results = compareResults({ accuracy: 0.95, loss: 0.1 }, { accuracy: 0.951, loss: 0.09 })
    expect(results[0]!.match).toBe(true)
    expect(results[1]!.match).toBe(false)
  })
})

const root = mkdtempSync(join(tmpdir(), "researchos-reproduce-"))
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
describe("ReproduceStore", () => {
  test("persists a six-step run, metrics, issues, and cancellation", () => {
    const store = new ReproduceStore(root)
    const id = store.create("https://example.org/paper", "https://example.org/repo.git", "auto")
    expect(store.steps(id).map((step) => step.name)).toEqual(["clone", "analyze", "env_detect", "env_generate", "run", "compare"])
    store.startStep(id, "clone")
    store.finishStep(id, "clone", "cloned", { commit: "abc" })
    expect(store.step(id, "clone").status).toBe("completed")
    store.addMetric({ runId: id, model: "m", dataset: "d", metric: "accuracy", paperValue: 0.9, tolerance: 0.01, verdict: "missing_repro", source: "paper_extract" })
    store.addIssue({ runId: id, category: "dependency", severity: "blocker", title: "missing", detail: "install it" })
    expect(store.metrics(id)).toHaveLength(1)
    expect(store.issues(id)).toHaveLength(1)
    store.cancel(id)
    expect(store.run(id).status).toBe("cancelled")
    store.close()
  })
})

describe("six-step runner", () => {
  test("clones and executes an explicit local mini repository through comparison", async () => {
    const source = join(root, "source")
    mkdirSync(source)
    writeFileSync(join(source, "README.md"), "Run with `python experiment.py`.")
    writeFileSync(join(source, "reproduce.json"), JSON.stringify({ command: ["python", "experiment.py"] }))
    writeFileSync(join(source, "experiment.py"), "import json\njson.dump({'accuracy': 0.91}, open('metrics.json', 'w'))\n")
    for (const command of [["git", "init"], ["git", "add", "."], ["git", "-c", "user.name=ResearchOS", "-c", "user.email=test@researchos.local", "commit", "-m", "fixture"]]) {
      const process = Bun.spawn({ cmd: command, cwd: source, stdout: "ignore", stderr: "ignore" })
      expect(await process.exited).toBe(0)
    }
    const store = new ReproduceStore(root)
    const id = store.create("https://example.org/paper", pathToFileURL(source).href, "auto")
    store.addMetric({ runId: id, model: "mini", dataset: "fixture", metric: "accuracy", paperValue: 0.9, tolerance: 0.02, verdict: "missing_repro", source: "paper_extract" })
    store.close()
    for (const step of ["clone", "analyze", "env_detect", "env_generate", "run", "compare"] as const) expect((await advanceRun(root, id, step)).status).toBe("completed")
    const result = new ReproduceStore(root)
    expect(result.run(id).status).toBe("completed")
    expect(result.metrics(id).find((metric) => metric.source === "run_artifact")?.verdict).toBe("match")
    result.close()
  }, 30_000)
})
