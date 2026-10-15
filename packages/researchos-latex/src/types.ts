export interface LatexError {
  file: string
  line: number
  message: string
  severity: "error" | "warning"
}

export interface CompileResult {
  ok: boolean
  pdfPath?: string
  log: string
  errors: LatexError[]
  durationMs: number
}

// tectonic 缺失时返回诚实的不可用状态（含安装指引），绝不假装编译成功
export type CompileResponse =
  | { available: false; message: string; installHint: string }
  | ({ available: true } & CompileResult)

export interface BibtexEntry {
  type: string
  key: string
  fields: Record<string, string>
}

export interface OutlineItem {
  level: number
  title: string
  line: number
}

export interface FormatIssue {
  file: string
  line: number
  rule: string
  severity: "error" | "warning" | "info"
  message: string
}

export type SynctexForwardResult = { page: number; x: number; y: number }
export type SynctexInverseResult = { file: string; line: number }
