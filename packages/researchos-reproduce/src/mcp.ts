import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { advanceRun } from "./runner"
import { ReproduceStore } from "./store"

export function createReproduceMcpServer(root: string) {
  const server = new McpServer({ name: "researchos-reproduce", version: "0.1.0" })
  server.registerTool("start", { description: "Create a durable paper reproduction run without executing it", inputSchema: { paper_url: z.string().url(), repo_url: z.string().url(), env_strategy: z.enum(["auto", "docker", "venv"]).default("auto") } }, ({ paper_url, repo_url, env_strategy }) => withStore(root, (store) => ({ run_id: store.create(paper_url, repo_url, env_strategy) }), { panel: "reproduce", resource: undefined, mode: "auto" }))
  server.registerTool("status", { description: "Get the durable run and six step records", inputSchema: { run_id: z.string() } }, ({ run_id }) => withStore(root, (store) => ({ run: store.run(run_id), steps: store.steps(run_id) }), { panel: "reproduce", resource: run_id, mode: "badge" }))
  server.registerTool("run_step", { description: "Execute one explicit reproduction step after its predecessor", inputSchema: { run_id: z.string(), step: z.enum(["clone", "analyze", "env_detect", "env_generate", "run", "compare"]) } }, ({ run_id, step }) => advanceRun(root, run_id, step).then((result) => json(result, { panel: "reproduce", resource: run_id, mode: "auto" })))
  server.registerTool("submit_paper_metrics", { description: "Persist paper metrics that were explicitly verified from the source", inputSchema: { run_id: z.string(), metrics: z.array(z.object({ model: z.string(), dataset: z.string(), metric: z.string(), value: z.number(), tolerance: z.number().default(0.01) })) } }, ({ run_id, metrics }) => withStore(root, (store) => { metrics.forEach((metric) => store.addMetric({ runId: run_id, model: metric.model, dataset: metric.dataset, metric: metric.metric, paperValue: metric.value, tolerance: metric.tolerance, verdict: "missing_repro", source: "paper_extract" })); return { ok: true } }, { panel: "reproduce", resource: run_id, mode: "badge" }))
  server.registerTool("comparison", { description: "Read paper-versus-reproduced metric records", inputSchema: { run_id: z.string() } }, ({ run_id }) => withStore(root, (store) => ({ metrics: store.metrics(run_id).filter((metric) => metric.source === "run_artifact") }), { panel: "reproduce", resource: run_id, mode: "badge" }))
  server.registerTool("diagnose", { description: "Read evidence-backed deterministic failure diagnoses", inputSchema: { run_id: z.string() } }, ({ run_id }) => withStore(root, (store) => ({ issues: store.issues(run_id), report_path: `.researchos/reproduce/runs/${run_id}/report.md` }), { panel: "reproduce", resource: run_id, mode: "auto" }))
  server.registerTool("cancel", { description: "Mark a reproduction run cancelled", inputSchema: { run_id: z.string() } }, ({ run_id }) => withStore(root, (store) => { store.cancel(run_id); return { ok: true } }, { panel: "reproduce", resource: run_id, mode: "badge" }))
  return server
}
function withStore(root: string, run: (store: ReproduceStore) => unknown, ui?: { panel: string; resource?: string; mode: "auto" | "confirm" | "badge" }) {
  const store = new ReproduceStore(root)
  const value = run(store)
  store.close()
  return Promise.resolve(json(value, ui))
}
function json(value: unknown, ui?: { panel: string; resource?: string; mode: "auto" | "confirm" | "badge" }) {
  const metadata = ui ? { "researchos.ui": ui } : undefined
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    ...(metadata ? { metadata } : {}),
  }
}
if (import.meta.main) await createReproduceMcpServer(process.env.RESEARCHOS_PROJECT_ROOT ?? process.cwd()).connect(new StdioServerTransport())
