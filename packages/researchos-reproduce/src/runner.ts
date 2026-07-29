import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { basename, resolve } from "path"
import { ReproduceStore } from "./store"

const names = ["clone", "analyze", "env_detect", "env_generate", "run", "compare"] as const
export async function advanceRun(root: string, id: string, name: typeof names[number]) {
  const store = new ReproduceStore(root)
  const run = store.run(id)
  const step = store.step(id, name)
  if (run.status === "cancelled") throw new Error("run is cancelled")
  if (step.seq > 1 && store.steps(id)[step.seq - 2]?.status !== "completed") throw new Error(`complete ${names[step.seq - 2]} before ${name}`)
  store.startStep(id, name)
  const directory = resolve(root, ".researchos", "reproduce", "runs", id)
  mkdirSync(resolve(directory, "logs"), { recursive: true })
  mkdirSync(resolve(directory, "artifacts"), { recursive: true })
  const execute = name === "clone" ? clone(run.repoUrl, directory) : name === "analyze" ? analyze(directory) : name === "env_detect" ? detect(directory) : name === "env_generate" ? generate(directory, run.envStrategy) : name === "run" ? runExperiment(directory) : compare(directory, store, id)
  try {
    const result = await execute
    const log = typeof result === "object" && result !== null && "log" in result ? String(result.log) : JSON.stringify(result, null, 2)
    store.finishStep(id, name, log.slice(-100_000), result)
    store.close()
    return { status: "completed", output: result, logTail: log.slice(-8_000) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    store.failStep(id, name, message, message)
    classify(store, id, message)
    store.close()
    throw error
  }
}

async function clone(repoUrl: string, directory: string) {
  if (!/^(https?:\/\/|file:\/\/)/.test(repoUrl)) throw new Error("repo URL must use https://, http://, or file://")
  const repo = resolve(directory, "repo")
  if (existsSync(resolve(repo, ".git"))) return { repo, log: "Repository already cloned; reusing the existing checkout." }
  mkdirSync(directory, { recursive: true })
  const result = await command(["git", "clone", "--depth", "1", "--", repoUrl, repo], directory, 300_000)
  if (result.code !== 0) throw new Error(result.log)
  const commit = await command(["git", "rev-parse", "HEAD"], repo, 30_000)
  return { repo, commit: commit.stdout.trim(), log: result.log }
}
function analyze(directory: string) {
  const repo = resolve(directory, "repo")
  const manifests = ["requirements.txt", "pyproject.toml", "environment.yml", "package.json", "Dockerfile", "reproduce.json"].filter((file) => existsSync(resolve(repo, file)))
  const readme = ["README.md", "README.rst", "README"].find((file) => existsSync(resolve(repo, file)))
  const entryHints = readme ? readFileSync(resolve(repo, readme), "utf8").split("\n").filter((line) => /python |bun |npm |docker /.test(line)).slice(0, 20) : []
  const output = { manifests, readme, entryHints }
  writeFileSync(resolve(directory, "artifacts", "analysis.json"), JSON.stringify(output, null, 2))
  return { ...output, log: `Found ${manifests.length} environment manifests and ${entryHints.length} command hints.` }
}
async function detect(directory: string) {
  const repo = resolve(directory, "repo")
  const [python, docker] = await Promise.all([command(["python", "--version"], repo, 10_000), command(["docker", "info", "--format", "{{.ServerVersion}}"], repo, 15_000)])
  const report = { python: python.code === 0 ? (python.stdout || python.stderr).trim() : undefined, docker: docker.code === 0 ? docker.stdout.trim() : undefined, hasRequirements: existsSync(resolve(repo, "requirements.txt")), hasPyproject: existsSync(resolve(repo, "pyproject.toml")), hasDockerfile: existsSync(resolve(repo, "Dockerfile")) }
  mkdirSync(resolve(directory, "env"), { recursive: true })
  writeFileSync(resolve(directory, "env", "env-report.json"), JSON.stringify(report, null, 2))
  return { ...report, log: JSON.stringify(report, null, 2) }
}
function generate(directory: string, requested: string) {
  const report = JSON.parse(readFileSync(resolve(directory, "env", "env-report.json"), "utf8")) as { docker?: string; python?: string }
  const strategy = requested === "auto" ? report.docker ? "docker" : "venv" : requested
  if (strategy === "docker" && !report.docker) throw new Error("Docker strategy requested but Docker is unavailable")
  if (strategy === "venv" && !report.python) throw new Error("venv strategy requested but Python is unavailable")
  const plan = { strategy, generatedAt: Date.now(), note: "Environment installation is deferred to the explicit experiment command to avoid mutating the cloned repository." }
  writeFileSync(resolve(directory, "env", "strategy.json"), JSON.stringify(plan, null, 2))
  return { ...plan, log: `Selected ${strategy} from detected host capabilities.` }
}
async function runExperiment(directory: string) {
  const repo = resolve(directory, "repo")
  const configPath = resolve(repo, "reproduce.json")
  if (!existsSync(configPath)) throw new Error("No reproduce.json found. Add {\"command\":[\"python\",\"script.py\"]} after reviewing the paper's official command.")
  const config = JSON.parse(readFileSync(configPath, "utf8")) as { command?: unknown }
  if (!Array.isArray(config.command) || !config.command.every((value) => typeof value === "string") || config.command.length === 0) throw new Error("reproduce.json command must be a non-empty string array")
  const result = await command(config.command, repo, 4 * 60 * 60 * 1000)
  writeFileSync(resolve(directory, "logs", "run.stdout.log"), result.stdout)
  writeFileSync(resolve(directory, "logs", "run.stderr.log"), result.stderr)
  if (result.code !== 0) throw new Error(result.log)
  const metrics = resolve(repo, "metrics.json")
  if (existsSync(metrics)) writeFileSync(resolve(directory, "artifacts", "metrics.json"), readFileSync(metrics))
  return { command: config.command, exitCode: result.code, metrics: existsSync(metrics) ? "artifacts/metrics.json" : undefined, log: result.log }
}
function compare(directory: string, store: ReproduceStore, id: string) {
  const path = resolve(directory, "artifacts", "metrics.json")
  if (!existsSync(path)) throw new Error("Experiment completed without artifacts/metrics.json")
  const values = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
  const paper = store.metrics(id).filter((metric) => metric.paperValue !== undefined)
  paper.forEach((metric) => {
    const reproduced = values[metric.metric]
    const reproValue = typeof reproduced === "number" ? reproduced : undefined
    const diff = reproValue === undefined ? undefined : Math.abs(metric.paperValue! - reproValue) / Math.max(Math.abs(metric.paperValue!), 1e-10)
    store.addMetric({ runId: id, model: metric.model, dataset: metric.dataset, metric: metric.metric, paperValue: metric.paperValue, ...(reproValue === undefined ? {} : { reproValue }), tolerance: metric.tolerance, verdict: diff === undefined ? "missing_repro" : diff <= metric.tolerance ? "match" : "mismatch", source: "run_artifact" })
  })
  return { compared: paper.length, log: `Compared ${paper.length} paper metrics with ${basename(path)}.` }
}
function classify(store: ReproduceStore, id: string, evidence: string) {
  const match = /ModuleNotFoundError|ImportError|ResolutionImpossible/.test(evidence) ? ["dependency", "Missing or conflicting dependency"] : /FileNotFoundError|No such file/.test(evidence) ? ["data", "Required file or dataset is missing"] : /CUDA|Python.*version|not available/.test(evidence) ? ["version", "Runtime version is incompatible"] : ["parameter", "Experiment command or parameters require review"]
  store.addIssue({ runId: id, category: match[0]!, severity: "blocker", title: match[1]!, detail: "The step stopped; inspect the preserved log before retrying.", evidence: evidence.slice(-4_000) })
}
async function command(cmd: string[], cwd: string, timeout: number) {
  const process = Bun.spawn({ cmd, cwd, stdout: "pipe", stderr: "pipe", env: { ...Bun.env, PYTHONUNBUFFERED: "1" } })
  const timer = setTimeout(() => process.kill(), timeout)
  const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])
  clearTimeout(timer)
  return { code, stdout, stderr, log: `${stdout}${stderr}`.slice(-100_000) }
}
