// 最小合法 PDF 生成器：单栏 Helvetica 文本流，逐页对象 + 手工计算 xref 偏移。
// 仅支持 ASCII 文本（测试 fixture 足够，保证字符串长度等于字节长度）。

export function makePdf(pages: string[][]): Uint8Array {
  const pageIds = pages.map((_, i) => 4 + i * 2)
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.flatMap((lines, i) => {
      const stream = contentStream(lines)
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`,
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      ]
    }),
  ]

  let pdf = "%PDF-1.4\n"
  const offsets = objects.map((body, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += "0000000000 65535 f \n"
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

function contentStream(lines: string[]): string {
  // pdfjs 会裁掉超出 MediaBox 的文本，长行按词边界折行（也顺带覆盖多行条目场景）
  const wrapped = lines.flatMap((line) => wrapLine(line, 76))
  const ops = wrapped.map((line, i) => `${i === 0 ? "" : "0 -14 Td "}(${escapeText(line)}) Tj`)
  return `BT /F1 12 Tf 72 770 Td\n${ops.join("\n")}\nET`
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) return [line]
  const words = line.split(" ")
  const rows: string[] = []
  let current = ""
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > width && current) {
      rows.push(current)
      current = word
      return
    }
    current = candidate
  })
  if (current) rows.push(current)
  return rows
}

function escapeText(line: string): string {
  return line.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1")
}
