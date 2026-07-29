---
name: paper-structure
description: Propose or review an academic paper outline against its research contribution and target venue. Use when the user asks to plan sections, restructure a manuscript, or compare the current LaTeX outline with a recommended structure.
---

# Paper Structure

1. Read the current `\section` tree, contribution summary, and target venue constraints when available.
2. Propose sections in dependency order; give 3-5 concrete content obligations per section.
3. Compare the proposal with the current outline as `keep`, `add`, `move`, or `merge`. Do not confuse stylistic preference with a venue requirement.
4. Return the proposed outline and the comparison. Do not create files or insert `\input{}` until the user approves a diff.
5. Preserve labels, citations, and existing factual claims during any accepted restructuring.
