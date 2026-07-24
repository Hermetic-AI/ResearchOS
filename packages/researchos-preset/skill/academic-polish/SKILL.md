---
name: academic-polish
description: Academic prose polishing methodology — rewrite text in academic, concise, or passive voice style. Use when the user asks to polish, rewrite, or improve academic writing.
version: 1.0.0
---

# Academic Polish Skill

## Goal

Improve academic writing quality without changing the core argument or factual content.

## Modes

### Academic
- Use formal academic register
- Prefer precise terminology over vague phrasing
- Avoid colloquialisms and contractions

### Concise
- Remove redundant phrases
- Split overly long sentences
- Eliminate filler words

### Passive
- Convert active voice to passive where appropriate
- Use "X was measured" instead of "We measured X"
- Maintain readability; do not over-passivize

## Workflow

1. Read the selected text and identify the target mode.
2. Rewrite sentence by sentence, preserving all citations and technical terms.
3. Present changes as a diff: original on left, polished on right.
4. User accepts or rejects each change individually.

## Anti-patterns

- Do not change the meaning of any sentence.
- Do not add or remove citations.
- Do not rewrite quoted text or code snippets.
