import { Location } from "@opencode-ai/core/location"
import { InvalidRequestError, UnknownError } from "@opencode-ai/protocol/errors"
import { ReproduceStore, advanceRun } from "@researchos/reproduce"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosReproduceHandler = HttpApiBuilder.group(Api, "server.researchos-reproduce", (handlers) => handlers
  .handle("reproduce.list", () => response(withLocation((directory) => withStore(directory, (store) => store.list()))))
  .handle("reproduce.create", ({ payload }) => response(withLocation((directory) => withStore(directory, (store) => ({ runId: store.create(payload.paperUrl, payload.repoUrl, payload.envStrategy ?? "auto") })))))
  .handle("reproduce.get", ({ params }) => response(withLocation((directory) => withStore(directory, (store) => ({ run: store.run(params.id), steps: store.steps(params.id) })))))
  .handle("reproduce.advance", ({ params }) => response(withLocation((directory) => advanceRun(directory, params.id, params.step))))
  .handle("reproduce.metricsSubmit", ({ params, payload }) => response(withLocation((directory) => withStore(directory, (store) => { payload.metrics.forEach((metric) => store.addMetric({ runId: params.id, model: metric.model, dataset: metric.dataset, metric: metric.metric, paperValue: metric.value, tolerance: metric.tolerance ?? 0.01, verdict: "missing_repro", source: "paper_extract" })); return { ok: true as const } }))))
  .handle("reproduce.comparison", ({ params }) => response(withLocation((directory) => withStore(directory, (store) => store.metrics(params.id).filter((metric) => metric.source === "run_artifact")))))
  .handle("reproduce.issues", ({ params }) => response(withLocation((directory) => withStore(directory, (store) => store.issues(params.id)))))
  .handle("reproduce.cancel", ({ params }) => response(withLocation((directory) => withStore(directory, (store) => { store.cancel(params.id); return { ok: true as const } })))),
)
function withStore<T>(directory: string, run: (store: ReproduceStore) => T) { const store = new ReproduceStore(directory); const result = run(store); store.close(); return Promise.resolve(result) }
function withLocation<T>(run: (directory: string) => Promise<T>) { return Effect.gen(function* () { const location = yield* Location.Service; return yield* Effect.tryPromise({ try: () => run(location.directory), catch: (error) => { const message = error instanceof Error ? error.message : String(error); if (/unknown|before|must|required|cancelled|unavailable|without/i.test(message)) return new InvalidRequestError({ message }); return new UnknownError({ message, ref: "researchos-reproduce" }) } }) }) }
