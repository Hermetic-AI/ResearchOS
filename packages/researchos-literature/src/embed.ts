export type Embedder = (texts: string[]) => Promise<number[][]>

type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): number[][] }>

// 模型首载约 100MB，缓存到项目 models/ 目录；首次调用才触发加载/下载
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
