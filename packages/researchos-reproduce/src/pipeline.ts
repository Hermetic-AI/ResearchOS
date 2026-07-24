import type { PipelineRun, PipelineStep, DiagnosticReport } from "./types"

export function createPipeline(paperUrl: string, repoUrl: string): PipelineRun {
  const id = `run_${Date.now()}`
  const steps: PipelineStep[] = ["clone", "analyze", "detect", "env", "run", "compare"]
  return {
    id,
    paperUrl,
    repoUrl,
    steps: steps.map((step) => ({ step, status: "pending", log: "" })),
    createdAt: Date.now(),
  }
}

export function parseDependencies(requirementsTxt: string): Record<string, string> {
  const deps: Record<string, string> = {}
  for (const line of requirementsTxt.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("==")
    if (eq >= 0) {
      deps[trimmed.substring(0, eq).trim()] = trimmed.substring(eq + 2).trim()
    } else {
      deps[trimmed.trim()] = "*"
    }
  }
  return deps
}

export function diagnose(
  requirementsTxt: string,
  pythonVersion: string,
  cudaAvailable: boolean,
): DiagnosticReport {
  const deps = parseDependencies(requirementsTxt)
  const report: DiagnosticReport = { version: [], dependencies: [], parameters: [], data: [] }

  if (pythonVersion && !pythonVersion.startsWith("3.")) {
    report.version.push({ package: "Python", required: "3.x", found: pythonVersion })
  }

  if (!cudaAvailable && (requirementsTxt.includes("torch") || requirementsTxt.includes("tensorflow"))) {
    report.dependencies.push({ name: "CUDA", issue: "ML framework detected but CUDA not available" })
  }

  for (const [name, version] of Object.entries(deps)) {
    if (version === "*") {
      report.dependencies.push({ name, issue: "Version not pinned" })
    }
  }

  return report
}

export function compareResults(
  reported: Record<string, number>,
  reproduced: Record<string, number>,
  tolerance: number = 0.01,
) {
  const results = []
  for (const [metric, reportedValue] of Object.entries(reported)) {
    const reproducedValue = reproduced[metric]
    if (reproducedValue === undefined) {
      results.push({ metric, reported: reportedValue, reproduced: 0, diff: 1, match: false })
      continue
    }
    const diff = Math.abs(reportedValue - reproducedValue) / Math.max(Math.abs(reportedValue), 1e-10)
    results.push({ metric, reported: reportedValue, reproduced: reproducedValue, diff, match: diff <= tolerance })
  }
  return results
}
