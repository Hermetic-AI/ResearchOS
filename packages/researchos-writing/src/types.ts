export const REWRITE_STYLES = ["academic", "concise", "passive"] as const
export type RewriteStyle = (typeof REWRITE_STYLES)[number]

export const SUGGESTION_KINDS = ["title", "structure", "rewrite", "algorithm", "table", "md", "cite"] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

export const SUGGESTION_STATUSES = ["pending", "accepted", "rejected", "partial"] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]
