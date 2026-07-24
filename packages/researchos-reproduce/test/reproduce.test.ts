import { describe, test, expect } from "bun:test"
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
    expect(results[0].match).toBe(true)
    expect(results[1].match).toBe(false)
  })
})
