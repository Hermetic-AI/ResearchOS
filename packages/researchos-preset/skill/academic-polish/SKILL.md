---
name: academic-polish
description: Academic prose polishing methodology — rewrite text in academic, concise, or passive voice style without altering facts, citations, or math. Use when the user asks to polish, rewrite, or improve academic writing.
---

# Academic Polish Skill

## Goal

Improve academic writing quality without changing the core argument or factual content.

## Protected spans (treat as opaque tokens)

`\cite{...}` / `\ref{...}` / `\label{...}`, inline `$...$` and display math, URLs, proper nouns, and code snippets. Never alter, move, or delete them; reinsert at their original logical positions.

## Modes

### Academic
- Use formal academic register
- Prefer precise terminology and hedged claims ("suggests", "indicates")
- Avoid colloquialisms and contractions

### Concise
- Remove redundant phrases and filler words
- Split sentences over 40 words
- Prefer strong verbs

### Passive
- Convert active voice to passive where the actor is unimportant
- Use "X was measured" instead of "We measured X"
- Maintain readability; do not over-passivize

## Workflow

1. Read the selected text, identify the target mode, and mark all protected spans.
2. Rewrite sentence by sentence per mode.
3. Present changes as a diff (word-level, sentence hunks): the user accepts or rejects each hunk individually. Never apply changes silently.
4. After review, record the outcome via the `suggest_record` tool (accepted / partial / rejected with hunk decisions).

## Output contract

Return ONLY the rewritten text — no commentary, no markdown fences. Length stays within ±20% of the input. Do not add claims, numbers, or citations that are not in the input. Do not change the meaning of any sentence or rewrite quoted text.

