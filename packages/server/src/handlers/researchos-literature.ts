import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const ResearchosLiteratureHandler = HttpApiBuilder.group(
  Api,
  "server.researchos-literature",
  (handlers) =>
    handlers
      .handle("literature.search", ({ query }) =>
        response(
          Effect.succeed([
            {
              id: "stub-001",
              title: `Search results for: ${query.query}`,
              year: 2024,
              authors: [{ name: "Stub Author" }],
              citationCount: 0,
              source: "arxiv",
            } as const,
          ]),
        ),
      )
      .handle("literature.list", () =>
        response(
          Effect.succeed([
            {
              id: "stub-001",
              title: "Literature database (stub)",
              year: 2024,
              authors: [{ name: "Stub" }],
              citationCount: 0,
              source: "manual",
            } as const,
          ]),
        ),
      )
      .handle("literature.get", ({ query }) =>
        response(
          Effect.succeed({
            id: query.id,
            title: `Paper: ${query.id}`,
            year: 2024,
            authors: [{ name: "Stub" }],
            citationCount: 0,
            source: "manual",
          } as const),
        ),
      )
      .handle("literature.export", ({ query }) =>
        response(
          Effect.succeed({
            content: `@article{${query.paperIds},\n  title = {Export stub}\n}`,
          }),
        ),
      ),
)
