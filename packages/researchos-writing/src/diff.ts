import { diffWords } from "diff"

export interface WordDiffPart {
  value: string
  added?: boolean
  removed?: boolean
}

// 润色 review 的 hunk：按句对齐的一对原文/改写（设计 §6.3，hunk 级接受/拒绝）
export interface DiffHunk {
  index: number
  original: string
  revised: string
}

export function wordDiff(original: string, revised: string): WordDiffPart[] {
  return diffWords(original, revised)
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

// 句级对齐切 hunk；index 保持句子序号（被滤掉的相同句不占 hunk），供 applyHunks 对齐
export function hunksFromRewrite(original: string, revised: string): DiffHunk[] {
  const before = splitSentences(original)
  const after = splitSentences(revised)
  const count = Math.max(before.length, after.length)
  return Array.from({ length: count }, (_, index) => ({
    index,
    original: before[index] ?? "",
    revised: after[index] ?? "",
  })).filter((hunk) => hunk.original !== hunk.revised)
}

// review 完成后拼回最终文本：被接受的 hunk 用改写，其余保留原文（index 为句子序号）
export function applyHunks(original: string, revised: string, accepted: Set<number>): string {
  const before = splitSentences(original)
  const after = splitSentences(revised)
  return Array.from({ length: Math.max(before.length, after.length) }, (_, index) =>
    accepted.has(index) ? after[index] ?? "" : before[index] ?? "",
  ).filter((part) => part.length > 0).join(" ")
}
