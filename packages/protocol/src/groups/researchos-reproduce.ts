import { Location } from "@opencode/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { InvalidRequestError, UnknownError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

const errors = [InvalidRequestError, UnknownError]
const Run = Schema.Struct({ id: Schema.String, paperUrl: Schema.String, repoUrl: Schema.String, status: Schema.String, currentStep: Schema.Number, envStrategy: Schema.String, error: Schema.optional(Schema.String), createdAt: Schema.Number, updatedAt: Schema.Number })
const Step = Schema.Struct({ id: Schema.String, runId: Schema.String, seq: Schema.Number, name: Schema.String, status: Schema.String, log: Schema.String, outputJson: Schema.optional(Schema.String), startedAt: Schema.optional(Schema.Number), finishedAt: Schema.optional(Schema.Number) })
const Metric = Schema.Struct({ id: Schema.String, runId: Schema.String, model: Schema.String, dataset: Schema.String, metric: Schema.String, paperValue: Schema.optional(Schema.Number), reproValue: Schema.optional(Schema.Number), tolerance: Schema.Number, verdict: Schema.String, source: Schema.String })
const Issue = Schema.Struct({ id: Schema.String, runId: Schema.String, category: Schema.String, severity: Schema.String, title: Schema.String, detail: Schema.String, evidence: Schema.optional(Schema.String), createdAt: Schema.Number })
export const ResearchosReproduceGroup = HttpApiGroup.make("server.researchos-reproduce")
  .add(HttpApiEndpoint.get("reproduce.list", "/api/reproduce/runs", { query: LocationQuery, success: Location.response(Schema.Array(Run)), error: [UnknownError] }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("reproduce.create", "/api/reproduce/runs", { query: LocationQuery, payload: Schema.Struct({ paperUrl: Schema.String, repoUrl: Schema.String, envStrategy: Schema.optional(Schema.Literals(["auto", "docker", "venv"])) }), success: Location.response(Schema.Struct({ runId: Schema.String })), error: errors }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("reproduce.get", "/api/reproduce/runs/:id", { params: { id: Schema.String }, query: LocationQuery, success: Location.response(Schema.Struct({ run: Run, steps: Schema.Array(Step) })), error: errors }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("reproduce.advance", "/api/reproduce/runs/:id/steps/:step", { params: { id: Schema.String, step: Schema.Literals(["clone", "analyze", "env_detect", "env_generate", "run", "compare"]) }, query: LocationQuery, success: Location.response(Schema.Struct({ status: Schema.String, output: Schema.Unknown, logTail: Schema.String })), error: errors }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("reproduce.metricsSubmit", "/api/reproduce/runs/:id/metrics", { params: { id: Schema.String }, query: LocationQuery, payload: Schema.Struct({ metrics: Schema.Array(Schema.Struct({ model: Schema.String, dataset: Schema.String, metric: Schema.String, value: Schema.Number, tolerance: Schema.optional(Schema.Number) })) }), success: Location.response(Schema.Struct({ ok: Schema.Literal(true) })), error: errors }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("reproduce.comparison", "/api/reproduce/runs/:id/comparison", { params: { id: Schema.String }, query: LocationQuery, success: Location.response(Schema.Array(Metric)), error: errors }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.get("reproduce.issues", "/api/reproduce/runs/:id/issues", { params: { id: Schema.String }, query: LocationQuery, success: Location.response(Schema.Array(Issue)), error: errors }).annotateMerge(locationQueryOpenApi))
  .add(HttpApiEndpoint.post("reproduce.cancel", "/api/reproduce/runs/:id/cancel", { params: { id: Schema.String }, query: LocationQuery, success: Location.response(Schema.Struct({ ok: Schema.Literal(true) })), error: errors }).annotateMerge(locationQueryOpenApi))
  .annotateMerge(OpenApi.annotations({ title: "researchos-reproduce", description: "Durable six-step paper reproduction pipeline." }))
