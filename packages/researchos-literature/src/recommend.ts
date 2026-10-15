import type { LiteratureDB } from "./db"
import type { Embedder } from "./embed"
import type { PaperMeta, RecommendResult, ScoredPaper } from "./types"

const CO_CITATION_BONUS = 0.15

export interface RecommendOptions {
  db: LiteratureDB
  embedder: Embedder | null
  limit?: number
}

export async function recommendSimilar(paperId: string, options: RecommendOptions): Promise<RecommendResult> {
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 10)))
  const target = options.db.getPaper(paperId)
  if (!target) throw new Error(`Unknown paper: ${paperId}`)
  const candidates = options.db.getPapers(
    options.db.listPapers(1000).map((card) => card.id).filter((id) => id !== paperId),
  )
  const coCitations = options.db.coCitationCounts(paperId)
  const vectors = await vectorScores(target, options, limit)
  const results = candidates
    .map((paper) => ({
      paper,
      score:
        (vectors ? vectors.get(paper.id) ?? 0 : keywordOverlap(target, paper)) +
        CO_CITATION_BONUS * (coCitations.get(paper.id) ?? 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => toScoredCard(entry.paper, entry.score))
  return { results, degraded: vectors === null }
}

async function vectorScores(
  target: PaperMeta,
  options: RecommendOptions,
  limit: number,
): Promise<Map<string, number> | null> {
  if (!options.db.vecAvailable || !options.embedder || !target.abstract) return null
  // 嵌入推理或 vec0 查询失败时整体降级为关键词模式，不阻断推荐
  try {
    const existing = options.db.getEmbedding(target.id)
    const computed = existing ?? (await options.embedder([target.abstract]))[0]
    if (!computed) return null
    if (!existing) options.db.upsertEmbedding(target.id, computed)
    // vec0 距离为 L2；归一化向量下 L2 与余弦距离单调一致，1/(1+d) 归一到 (0,1]
    return new Map(
      options.db.knn(computed, limit * 3).map(({ paperId, distance }) => [paperId, 1 / (1 + distance)]),
    )
  } catch {
    return null
  }
}

function keywordOverlap(target: PaperMeta, paper: PaperMeta): number {
  const targetWords = wordSet(target)
  const shared = Array.from(wordSet(paper)).filter((word) => targetWords.has(word)).length
  return shared / Math.max(1, targetWords.size)
}

function wordSet(paper: PaperMeta): Set<string> {
  return new Set(`${paper.title} ${paper.abstract ?? ""}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
}

function toScoredCard(paper: PaperMeta, score: number): ScoredPaper {
  return {
    id: paper.id,
    title: paper.title,
    year: paper.year,
    venue: paper.venue,
    authors: paper.authors.map((author) => ({ name: author.name })),
    citationCount: paper.citationCount,
    isRead: paper.isRead,
    isFavorite: paper.isFavorite,
    source: paper.source,
    score,
  }
}
