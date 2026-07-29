---
name: reproduce-paper
description: Orchestrate an evidence-backed paper code reproduction through clone, analysis, environment detection, explicit execution, metric comparison, and diagnosis.
---

# Reproduce a Paper

1. Create a run with `researchos-reproduce_start`; creation does not execute code.
2. Execute clone and analyze in order. Read the repository README and confirm the official experiment command.
3. Record only paper metrics you can cite with `submit_paper_metrics`.
4. Run environment detection and generation. Do not silently install or change dependencies.
5. Require a reviewed `reproduce.json` string-array command before the run step.
6. Execute run and compare, then inspect durable comparison and diagnosis records.
7. Report failures honestly with preserved evidence. Never invent a metric or successful status.
