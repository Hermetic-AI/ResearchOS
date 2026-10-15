export interface PaperChunk {
  section: string | null
  text: string
}

const TARGET_CHARS = 1200
const OVERLAP_CHARS = 200
const HEADING_MAX_LEN = 80

// 与 references.ts 的参考文献标题识别保持一致：命中后正文到此为止（引用已进 citation_edge）
const REFERENCES_HEADING = /^\s*(?:\d+\.?\s*)?(references|bibliography)\s*$/i
const BARE_HEADING = /^(?:abstract|introduction|background|related work|methods?|methodology|materials and methods|experimental setup|experiments?|results|discussion|conclusions?|acknowledg?e?ments?|appendix)\s*$/i
// 编号标题（"1. Introduction" / "2 Methods"）：行短、以字母开头、不以句读结尾，避免误中枚举正文
const NUMBERED_HEADING = /^\d+(?:\.\d+)*\.?\s+\p{L}[^.;:]*$/u

export function chunkPaperText(text: string): PaperChunk[] {
  const paragraphs = splitSections(text)
  const chunks: PaperChunk[] = []
  let buffer = ""
  let section: string | null = null
  const flush = () => {
    const trimmed = buffer.trim()
    buffer = ""
    if (trimmed) chunks.push({ section, text: trimmed })
  }
  for (const paragraph of paragraphs) {
    if (paragraph.section !== section) {
      flush()
      section = paragraph.section
    }
    for (const piece of splitLong(paragraph.text)) {
      if (buffer && buffer.length + piece.length + 1 > TARGET_CHARS) {
        const tail = buffer.slice(-OVERLAP_CHARS)
        flush()
        // 重叠只在同一 section 内延续：跨 section 时 flush 已清空 buffer
        buffer = tail
      }
      buffer = buffer ? `${buffer}\n\n${piece}` : piece
    }
  }
  flush()
  return chunks
}

interface SectionParagraph {
  section: string | null
  text: string
}

function splitSections(text: string): SectionParagraph[] {
  const out: SectionParagraph[] = []
  let section: string | null = null
  let lines: string[] = []
  const flush = () => {
    // PDF 文本按行断行，同段内换行折叠为空格
    const paragraph = lines.join(" ").replace(/\s+/g, " ").trim()
    lines = []
    if (paragraph) out.push({ section, text: paragraph })
  }
  for (const line of text.split("\n")) {
    if (REFERENCES_HEADING.test(line)) {
      flush()
      break
    }
    const trimmed = line.trim()
    const heading = detectHeading(trimmed)
    if (heading) {
      flush()
      section = heading
      continue
    }
    if (!trimmed) {
      flush()
      continue
    }
    lines.push(trimmed)
  }
  flush()
  return out
}

function detectHeading(line: string): string | null {
  if (!line || line.length >= HEADING_MAX_LEN) return null
  if (BARE_HEADING.test(line)) return line
  if (NUMBERED_HEADING.test(line)) return line
  return null
}

function splitLong(text: string): string[] {
  if (text.length <= TARGET_CHARS) return [text]
  const out: string[] = []
  for (let start = 0; start < text.length; start += TARGET_CHARS - OVERLAP_CHARS) {
    out.push(text.slice(start, start + TARGET_CHARS))
  }
  return out
}
