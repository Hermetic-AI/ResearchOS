import { resolve } from "path"
import { Location } from "@opencode/core/location"
import { InvalidRequestError, UnknownError } from "@opencode/protocol/errors"
import {
  PlotStore,
  editDiagram,
  insertArtifactToPaper,
  persistGraphviz,
  persistMermaid,
  saveDiagram,
} from "@researchos/plot-core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosPlotHandler = HttpApiBuilder.group(Api, "server.researchos-plot", (handlers) =>
  handlers
    .handle("plot.create", ({ payload }) => response(withLocation(async (directory) => {
      const result = await runBridge(directory, "create", {
        template: payload.template,
        data: payload.data,
        theme: payload.theme ?? "nature",
        ...(payload.spec ? { spec: payload.spec } : {}),
      }) as BridgeChartResult
      return wireChart(result)
    })))
    .handle("plot.tune", ({ params, payload }) => response(withLocation(async (directory) => {
      const result = await runBridge(directory, "tune", {
        chart_id: params.id,
        patch: payload.patch,
      }) as BridgeTuneResult
      return {
        ...wireChart(result),
        code: result.code,
        codePriority: result.code_priority,
      }
    })))
    .handle("plot.annotateSignificance", ({ params, payload }) => response(withLocation(async (directory) => {
      const result = await runBridge(directory, "annotate", {
        chart_id: params.id,
        test: payload.test,
        groups: payload.groups,
      }) as BridgeSignificanceResult
      return {
        ...wireChart(result),
        pValues: result.p_values.map((value) => ({
          groups: value.groups,
          pValue: value.p_value,
          stars: value.stars,
        })),
      }
    })))
    .handle("plot.mermaid", ({ payload }) => response(withLocation((directory) => persistMermaid(directory, payload))))
    .handle("plot.graphviz", ({ payload }) => response(withLocation((directory) => persistGraphviz(directory, payload))))
    .handle("plot.diagram", ({ payload }) => response(withLocation((directory) => Promise.resolve(editDiagram(directory, {
      action: payload.action,
      ...(payload.file ? { file: payload.file } : {}),
      ...(payload.stencilPack ? { stencil_pack: payload.stencilPack } : {}),
    })))))
    .handle("plot.diagramSave", ({ payload }) => response(withLocation((directory) => Promise.resolve(
      saveDiagram(directory, payload),
    ))))
    .handle("plot.insertToPaper", ({ payload }) => response(withLocation((directory) => Promise.resolve(
      insertArtifactToPaper(directory, {
        artifact_path: payload.artifactPath,
        tex_file: payload.texFile,
        caption: payload.caption,
        ...(payload.section ? { section: payload.section } : {}),
        ...(payload.label ? { label: payload.label } : {}),
      }),
    ))))
    .handle("plot.artifacts", () => response(withLocation(async (directory) => {
      const store = new PlotStore(directory)
      const artifacts = store.listArtifacts().map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        ...(artifact.chartId ? { chartId: artifact.chartId } : {}),
        path: artifact.path,
        ...(artifact.previewSvg ? { previewSvg: artifact.previewSvg } : {}),
        ...(artifact.texFile ? { texFile: artifact.texFile } : {}),
        ...(artifact.texLabel ? { texLabel: artifact.texLabel } : {}),
        createdAt: artifact.createdAt,
      }))
      store.close()
      return artifacts
    })))
    .handle("plot.artifactFile", ({ params }) => response(withLocation(async (directory) => {
      const store = new PlotStore(directory)
      const file = store.readArtifact(params.id)
      store.close()
      const text = ["svg", "mmd", "dot", "drawio", "tex", "pgf"].includes(file.format)
      return {
        format: file.format,
        content: text ? new TextDecoder().decode(file.content) : Buffer.from(file.content).toString("base64"),
        encoding: (text ? "utf8" : "base64") as "utf8" | "base64",
      }
    }))),
)

function withLocation<T>(run: (directory: string) => Promise<T>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    return yield* Effect.tryPromise({
      try: () => run(location.directory),
      catch: (error) => {
        if (error instanceof InvalidRequestError) return error
        const message = error instanceof Error ? error.message : String(error)
        if (/ValueError|KeyError|invalid|unknown|not found|required|unsupported|escapes/i.test(message)) {
          return new InvalidRequestError({ message })
        }
        return new UnknownError({ message, ref: "researchos-plot" })
      },
    })
  })
}

async function runBridge(directory: string, operation: "create" | "tune" | "annotate", payload: Record<string, unknown>) {
  const process = Bun.spawn({
    cmd: ["uv", "run", "--directory", resolve(import.meta.dir, "../../../researchos-mcp/plot"), "researchos-plot-bridge"],
    cwd: directory,
    env: { ...Bun.env, RESEARCHOS_PROJECT_ROOT: directory },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  process.stdin.write(JSON.stringify({ operation, payload }))
  process.stdin.end()
  const timer = setTimeout(() => process.kill(), 120_000)
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  clearTimeout(timer)
  if (exitCode !== 0) throw new Error(stderr.trim() || `plot bridge exited with code ${exitCode}`)
  return JSON.parse(stdout) as unknown
}

function wireChart(result: BridgeChartResult) {
  return {
    chartId: result.chart_id,
    artifactPath: result.artifact_path,
    previewSvg: result.preview_svg,
  }
}

interface BridgeChartResult {
  chart_id: string
  artifact_path: string
  preview_svg: string
}

interface BridgeTuneResult extends BridgeChartResult {
  code: string
  code_priority: boolean
}

interface BridgeSignificanceResult extends BridgeChartResult {
  p_values: Array<{
    groups: [string, string]
    p_value: number
    stars: "*" | "**" | "***" | "ns"
  }>
}
