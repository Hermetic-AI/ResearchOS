# @researchos/api-hub

The shared outbound HTTP layer for ResearchOS academic services. It provides:

- declarative, narrow Zod adapters without vendor SDKs;
- per-provider token-bucket queues and retry of transient failures;
- project-local SQLite response caching at `.researchos/api-cache.db`;
- `{env:VARIABLE}` credential resolution without persisting secrets in cache;
- process-local health and call statistics for the asset management API panel.

The package currently includes arXiv, Crossref, Semantic Scholar, and PubMed adapters. Consumers should call those adapters through `HubImpl`; they should not duplicate direct outbound fetch logic.

Run validation from this directory:

```sh
bun typecheck
bun test
```
