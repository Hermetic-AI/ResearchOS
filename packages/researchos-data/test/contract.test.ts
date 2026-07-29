import { describe, expect, test } from "bun:test"
import { ChartInput, LinkExperimentInput, RunPythonInput, StatTestInput } from "../src/contract"

describe("contract schemas", () => {
  test("run_python applies timeout default and bounds", () => {
    expect(RunPythonInput.parse({ code: "1", workdir: "." }).timeout_s).toBe(120)
    expect(() => RunPythonInput.parse({ code: "1", workdir: ".", timeout_s: 0 })).toThrow()
    expect(() => RunPythonInput.parse({ code: "1", workdir: ".", timeout_s: 601 })).toThrow()
  })

  test("stat_test rejects unknown tests and empty columns", () => {
    expect(() => StatTestInput.parse({ file: "a.csv", test: "bogus", columns: ["x"] })).toThrow()
    expect(() => StatTestInput.parse({ file: "a.csv", test: "ttest", columns: [] })).toThrow()
    expect(StatTestInput.parse({ file: "a.csv", test: "ttest", columns: ["x"], params: { equal_var: false } }).test).toBe("ttest")
  })

  test("chart validates kind/format/dpi", () => {
    expect(ChartInput.parse({ file: "a.csv", kind: "hist", spec: {}, format: "png", dpi: 300 }).dpi).toBe(300)
    expect(() => ChartInput.parse({ file: "a.csv", kind: "pie", spec: {}, format: "png", dpi: 300 })).toThrow()
    expect(() => ChartInput.parse({ file: "a.csv", kind: "hist", spec: {}, format: "png", dpi: 10 })).toThrow()
  })

  test("link_experiment output shape", () => {
    expect(LinkExperimentInput.parse({ artifact_path: "a.pdf" })).toEqual({ artifact_path: "a.pdf" })
  })
})
