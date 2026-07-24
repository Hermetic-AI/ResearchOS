import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosPlotHandler = HttpApiBuilder.group(Api, "server.researchos-plot", (h) =>
  h
    .handle("plot.create", () => response(Effect.succeed({ chartId: "stub", artifactPath: "stub.pdf", previewSvg: "<svg/>" })))
    .handle("plot.mermaid", ({ payload }) => response(Effect.succeed({ text: `<svg><!-- mermaid:${payload.source.substring(0, 20)} --></svg>` })))
    .handle("plot.graphviz", ({ payload }) => response(Effect.succeed({ text: `<svg><!-- dot:${payload.source.substring(0, 20)} --></svg>` })))
    .handle("plot.insertToPaper", ({ payload }) => response(Effect.succeed({ text: `\\includegraphics{figures/${payload.chartId}}` }))),
)
