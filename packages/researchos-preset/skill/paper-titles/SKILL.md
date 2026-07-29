---
name: paper-titles
description: Generate diverse academic paper title candidates from an abstract, contribution summary, or keywords. Use when the user asks for paper title ideas, title refinement, or title variants for a venue.
---

# Paper Titles

1. Read the supplied abstract or contribution summary. Ask for missing subject matter rather than inventing it.
2. Produce 5 candidates spanning descriptive, problem-led, method-for-task, and result-led forms where evidence permits.
3. Keep each title concise, specific, and free of unsupported superiority claims.
4. Return a JSON array of `{ "title": string, "rationale": string }` with no markdown fence.
5. Present candidates for review. Replace `\title{}` only after explicit approval and through an editable diff.
