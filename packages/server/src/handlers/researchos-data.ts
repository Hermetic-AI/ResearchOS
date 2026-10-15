import { Location } from "@opencode/core/location"
import { InvalidRequestError, UnknownError } from "@opencode/protocol/errors"
import { DataStore, KernelClient } from "@researchos/data"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

const stores = new Map<string, DataStore>()
const kernels = new Map<string, KernelClient>()

export const ResearchosDataHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-data",
  (handlers) =>
    handlers
      .handle("data.notebooks", () => response(withStore((store) => {
        store.ensureNotebook()
        return Promise.resolve(store.listNotebooks())
      })))
      .handle("data.cells", ({ params }) => response(withStore((store) => {
        if (!store.getNotebook(params.id)) throw new InvalidRequestError({ message: `Unknown notebook: ${params.id}` })
        return Promise.resolve(store.listCells(params.id).map(wireCell))
      })))
      .handle("data.cellCreate", ({ params, payload }) => response(withStore((store) =>
        Promise.resolve(wireCell(store.createCell({ notebookId: params.id, ...(payload.source ? { source: payload.source } : {}) }))),
      )))
      .handle("data.cellSave", ({ params, payload }) => response(withStore((store) =>
        Promise.resolve(wireCell(store.updateCellSource(params.id, payload.source))),
      )))
      .handle("data.cellRun", ({ params, payload }) => response(withStore(async (store, directory) => {
        store.updateCellSource(params.id, payload.source)
        const kernel = kernels.get(directory) ?? new KernelClient(directory)
        if (!kernels.has(directory)) kernels.set(directory, kernel)
        const result = await kernel.execute({
          code: payload.source,
          workdir: payload.workdir ?? ".",
          timeoutS: payload.timeoutS ?? 120,
          cellId: params.id,
        })
        const cell = store.recordCellRun(params.id, {
          status: result.error ? "error" : "success",
          stdout: result.stdout,
          stderr: result.stderr,
          durationMs: result.duration_ms,
        })
        return { cell: wireCell(cell), artifacts: result.artifacts, ...(result.error ? { error: result.error } : {}) }
      })))
      .handle("data.datasets", () => response(withStore((store) => Promise.resolve(store.listDatasets().map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        path: dataset.path,
        format: dataset.format,
        sizeBytes: dataset.sizeBytes,
        ...(dataset.profileJson ? { profileJson: dataset.profileJson } : {}),
        createdAt: dataset.createdAt,
      }))))))
      .handle("data.artifacts", () => response(withStore((store) => Promise.resolve(store.listArtifacts().map(wireArtifact)))))
      .handle("data.artifact", ({ params }) => response(withStore((store) => {
        const artifact = store.getArtifact(params.id)
        if (!artifact) throw new InvalidRequestError({ message: `Unknown artifact: ${params.id}` })
        return Promise.resolve({
          artifact: wireArtifact(artifact),
          links: store.listLinks(artifact.id).map((link) => ({
            artifactId: link.artifactId,
            ...(link.gitCommit ? { gitCommit: link.gitCommit } : {}),
            ...(link.texFile ? { texFile: link.texFile } : {}),
            ...(link.texSection ? { texSection: link.texSection } : {}),
            linkedAt: link.linkedAt,
          })),
        })
      })))
      .handle("data.artifactFile", ({ params }) => response(withStore((store) => {
        const file = store.readArtifactFile(params.id)
        const isText = file.format === "svg"
        return Promise.resolve({
          format: file.format,
          content: isText ? new TextDecoder().decode(file.content) : Buffer.from(file.content).toString("base64"),
          encoding: (isText ? "utf8" : "base64") as "utf8" | "base64",
        })
      })))
      .handle("data.statTests", () => response(withStore((store) =>
        Promise.resolve(store.listStatTests().map((row) => ({
          id: row.id,
          test: row.test,
          columnsJson: row.columnsJson,
          ...(row.statistic !== null ? { statistic: row.statistic } : {}),
          ...(row.pValue !== null ? { pValue: row.pValue } : {}),
          conclusion: row.conclusion,
          createdAt: row.createdAt,
        }))),
      )))
      .handle("data.link", ({ params, payload }) => response(withStore((store) =>
        Promise.resolve(store.linkArtifact({
          artifactId: params.id,
          ...(payload.commit ? { commit: payload.commit } : {}),
          ...(payload.texFile ? { texFile: payload.texFile } : {}),
          ...(payload.texSection ? { texSection: payload.texSection } : {}),
        })),
      )))
      .handle("data.datasetRegister", ({ payload }) => response(withStore(async (store, directory) => {
        const { stat } = await import("fs/promises")
        const { resolve, basename, extname } = await import("path")
        const { path: filePath } = payload
        const absolute = resolve(directory, filePath)
        if (!absolute.startsWith(directory)) throw new InvalidRequestError({ message: "Path must be within the project workspace" })
        const info = await stat(absolute).catch(() => { throw new InvalidRequestError({ message: `File not found: ${filePath}` }) })
        const ext = extname(filePath).toLowerCase()
        const format = ({ ".csv": "csv", ".tsv": "tsv", ".parquet": "parquet", ".json": "json", ".jsonl": "jsonl", ".xlsx": "xlsx" } as Record<string, string>)[ext] ?? ext.slice(1)
        const dataset = store.registerDataset({
          path: filePath,
          name: payload.name || basename(filePath, ext),
          format,
          sizeBytes: info.size,
        })
        return {
          id: dataset.id,
          name: dataset.name,
          path: dataset.path,
          format: dataset.format,
          sizeBytes: dataset.sizeBytes,
          ...(dataset.profileJson ? { profileJson: dataset.profileJson } : {}),
          createdAt: dataset.createdAt,
        }
      }))),
)

function withStore<T>(run: (store: DataStore, directory: string) => Promise<T>) {
  return Effect.gen(function* () {
    const location = yield* Location.Service
    const existing = stores.get(location.directory)
    const store = existing ?? new DataStore(location.directory)
    if (!existing) stores.set(location.directory, store)
    return yield* Effect.tryPromise({
      try: async () => run(store, location.directory),
      catch: (error) => {
        if (error instanceof InvalidRequestError) return error
        return new UnknownError({
          message: error instanceof Error ? error.message : String(error),
          ref: "researchos-data",
        })
      },
    })
  })
}

function wireCell(cell: ReturnType<DataStore["listCells"]>[number]) {
  return {
    id: cell.id,
    notebookId: cell.notebookId,
    position: cell.position,
    source: cell.source,
    status: cell.status,
    ...(cell.stdout === null ? {} : { stdout: cell.stdout }),
    ...(cell.stderr === null ? {} : { stderr: cell.stderr }),
    ...(cell.durationMs === null ? {} : { durationMs: cell.durationMs }),
    ...(cell.executedAt === null ? {} : { executedAt: cell.executedAt }),
  }
}

function wireArtifact(artifact: ReturnType<DataStore["listArtifacts"]>[number]) {
  return {
    id: artifact.id,
    kind: artifact.kind,
    path: artifact.path,
    ...(artifact.previewPath ? { previewPath: artifact.previewPath } : {}),
    format: artifact.format,
    ...(artifact.dpi !== null ? { dpi: artifact.dpi } : {}),
    ...(artifact.latexSnippet ? { latexSnippet: artifact.latexSnippet } : {}),
    ...(artifact.specJson ? { specJson: artifact.specJson } : {}),
    createdAt: artifact.createdAt,
  }
}
