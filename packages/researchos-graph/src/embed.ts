import type { GraphNode } from "./types"

export type Embedder = (texts: string[]) => Promise<number[][]>

type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): number[][] }>

// 模型首载约 100MB，缓存到项目 graph/models/ 目录；首次调用才触发加载/下载
export function createEmbedder(cacheDir: string): Embedder {
  let extractorPromise: Promise<FeatureExtractor> | undefined
  return async (texts) => {
    extractorPromise ??= loadExtractor(cacheDir)
    const extractor = await extractorPromise
    const output = await extractor(texts, { pooling: "mean", normalize: true })
    return output.tolist()
  }
}

async function loadExtractor(cacheDir: string): Promise<FeatureExtractor> {
  // 重依赖动态加载：仅在确实需要嵌入时才引入 transformers.js
  const { pipeline, env } = await import("@huggingface/transformers")
  env.cacheDir = cacheDir
  const extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5")
  return extractor as unknown as FeatureExtractor
}

const EMBED_BATCH = 32
const EMBED_TEXT_LIMIT = 2000

// 批量回填节点嵌入：已有嵌入的节点跳过重算；嵌入失败不阻断写入，ask 侧本就以 degraded 降级 FTS
export async function embedGraphNodes(
  nodes: GraphNode[],
  store: {
    readonly vecAvailable?: boolean
    hasEmbedding?(nodeId: string): boolean
    upsertEmbedding?(nodeId: string, embedding: number[]): void
  },
  embedder: Embedder | null,
): Promise<void> {
  if (!store.vecAvailable || !store.upsertEmbedding || !embedder || !nodes.length) return
  const unique = Array.from(new Map(nodes.map((node) => [node.id, node])).values())
  const pending = unique.filter((node) => !store.hasEmbedding?.(node.id))
  if (!pending.length) return
  try {
    const batches = Array.from({ length: Math.ceil(pending.length / EMBED_BATCH) }, (_, index) =>
      pending.slice(index * EMBED_BATCH, (index + 1) * EMBED_BATCH),
    )
    for (const batch of batches) {
      const embeddings = await embedder(batch.map(embedText))
      batch.forEach((node, index) => {
        const embedding = embeddings[index]
        if (embedding) store.upsertEmbedding?.(node.id, embedding)
      })
    }
  } catch {
    // 静默降级：模型缺失或推理失败时保留 FTS-only 行为
  }
}

// 与 node_fts 索引内容一致（label + 字符串属性值），截断控制推理开销
function embedText(node: GraphNode): string {
  const attrText = Object.values(node.attrs).filter((value): value is string => typeof value === "string").join(" ")
  return [node.label, attrText].filter(Boolean).join(" ").slice(0, EMBED_TEXT_LIMIT)
}
