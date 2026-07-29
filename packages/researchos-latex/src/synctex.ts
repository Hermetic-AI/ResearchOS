import type { SynctexForwardResult, SynctexInverseResult } from "./types"

// SyncTeX 单位 sp：÷65536 得 pt
const SP_PER_PT = 65536

export interface SynctexRecord {
  page: number
  tag: number
  line: number
  x: number
  y: number
}

export interface SynctexIndex {
  inputs: Map<number, string>
  records: SynctexRecord[]
}

// .synctex 文本块格式：Input:<tag>:<path> 声明文件；{<page> 开页块；
// 记录行 <form><tag>,<line>:<x>,<y>（form 为 ([{hvxkg$ 之一）
export function parseSynctex(content: string): SynctexIndex {
  const inputs = new Map<number, string>()
  content.matchAll(/^Input:(\d+):(.+)$/gm).forEach((match) => {
    if (match[1] && match[2]) inputs.set(Number(match[1]), match[2].trim())
  })
  let page = 0
  const records = content.split("\n").flatMap((line) => {
    const pageOpen = /^\{(\d+)\s*$/.exec(line)
    if (pageOpen?.[1]) {
      page = Number(pageOpen[1])
      return []
    }
    const record = /^[a-z\[\(\{\$]?(-?\d+),(-?\d+):(-?\d+),(-?\d+)/.exec(line)
    if (!record) return []
    return [{ page, tag: Number(record[1]), line: Number(record[2]), x: Number(record[3]), y: Number(record[4]) }]
  })
  return { inputs, records }
}

export async function loadSynctex(synctexPath: string): Promise<SynctexIndex> {
  const compressed = new Uint8Array(await Bun.file(synctexPath).arrayBuffer())
  return parseSynctex(new TextDecoder().decode(Bun.gunzipSync(compressed)))
}

// 正向：编辑器 file/line → 最近的记录，换算 PDF page + pt 坐标
export function forwardLookup(index: SynctexIndex, file: string, line: number): SynctexForwardResult | null {
  const tags = tagsForFile(index, file)
  const candidates = index.records
    .filter((record) => tags.has(record.tag))
    .sort((a, b) => Math.abs(a.line - line) - Math.abs(b.line - line))
  const hit = candidates[0]
  if (!hit) return null
  return { page: hit.page, x: hit.x / SP_PER_PT, y: hit.y / SP_PER_PT }
}

// 反向：PDF page + pt 坐标 → 页内最近邻记录，回溯 Input 得 file/line
export function inverseLookup(index: SynctexIndex, page: number, x: number, y: number): SynctexInverseResult | null {
  const sx = x * SP_PER_PT
  const sy = y * SP_PER_PT
  const hit = index.records
    .filter((record) => record.page === page)
    .sort((a, b) => distance(a, sx, sy) - distance(b, sx, sy))[0]
  if (!hit) return null
  const file = index.inputs.get(hit.tag)
  if (!file) return null
  return { file, line: hit.line }
}

function tagsForFile(index: SynctexIndex, file: string): Set<number> {
  const normalized = file.replace(/\\/g, "/")
  return new Set(
    Array.from(index.inputs.entries())
      .filter(([, path]) => path.replace(/\\/g, "/").endsWith(normalized) || normalized.endsWith(path.replace(/\\/g, "/")))
      .map(([tag]) => tag),
  )
}

function distance(record: SynctexRecord, x: number, y: number): number {
  return Math.hypot(record.x - x, record.y - y)
}
